# Odos API v3 사용 가이드

## API 엔드포인트

```
POST https://api.odos.xyz/sor/quote/v3
```

## 요청 형식

### Headers
```json
{
  "Content-Type": "application/json"
}
```

### Request Body

```typescript
{
  chainId: number;                    // 체인 ID (Base: 8453)
  inputTokens: Array<{                 // 입력 토큰 배열
    tokenAddress: string;              // 토큰 주소 (소문자)
    amount: string;                     // 토큰 수량 (wei 단위, 문자열)
  }>;
  outputTokens: Array<{                // 출력 토큰 배열
    tokenAddress: string;              // 토큰 주소 (소문자)
  }>;
  userAddr: string;                     // 사용자 지갑 주소 (소문자)
  slippageLimitPercent: number;        // 슬리피지 한도 (% 단위, 예: 0.5 = 0.5%)
}
```

### 예시 요청

```json
{
  "chainId": 8453,
  "inputTokens": [
    {
      "tokenAddress": "0x4200000000000000000000000000000000000006",
      "amount": "1000000000000000"
    },
    {
      "tokenAddress": "0x50c5725949a6f0c72e6c4a641f24049a917370c5",
      "amount": "500000000000000000"
    }
  ],
  "outputTokens": [
    {
      "tokenAddress": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
    }
  ],
  "userAddr": "0x1234567890123456789012345678901234567890",
  "slippageLimitPercent": 0.5
}
```

## 응답 형식

```typescript
{
  inTokens: string[];                  // 입력 토큰 주소 배열
  outTokens: string[];                  // 출력 토큰 주소 배열
  inAmounts: string[];                 // 입력 토큰 수량 배열
  outAmounts: string[];                // 출력 토큰 수량 배열
  gasEstimate: number;                 // 예상 가스 사용량
  dataGasEstimate: number;             // 데이터 가스 예상량
  gweiPerGas: number;                  // 가스당 Gwei
  gasEstimateValue: number;            // 예상 가스 비용 (USD)
  inValues: number[];                   // 입력 토큰 가치 (USD)
  outValues: number[];                  // 출력 토큰 가치 (USD)
  netOutValue: number;                 // 순 출력 가치 (USD)
  priceImpact: number;                 // 가격 영향 (%)
  percentDiff: number;                 // 가격 차이 (%)
  permit2Message: any | null;          // Permit2 메시지 (필요시)
  permit2Hash: string | null;          // Permit2 해시 (필요시)
  pathId: string;                       // 경로 ID (assemble API 호출 시 필요)
  pathViz: any | null;                 // 경로 시각화 데이터
  blockNumber: number;                 // 블록 번호
}
```

## 주요 주의사항

### 1. 중복 토큰 제거
- **같은 토큰을 `inputTokens`에 두 번 이상 포함할 수 없습니다**
- ETH와 WETH를 동시에 선택하면 둘 다 WETH 주소로 변환되어 중복이 발생할 수 있습니다
- 중복을 방지하기 위해 토큰 주소를 기준으로 합산해야 합니다

### 2. ETH 처리
- ETH는 native token이므로 Odos API에서는 WETH 주소를 사용해야 합니다
- Base 네트워크의 WETH 주소: `0x4200000000000000000000000000000000000006`

### 3. 토큰 주소 형식
- 모든 주소는 소문자로 변환해야 합니다
- `0x` 접두사 포함

### 4. 수량 형식
- `amount`는 wei 단위의 문자열이어야 합니다
- BigInt를 문자열로 변환: `amount.toString()`

### 5. 슬리피지
- `slippageLimitPercent`는 퍼센트 단위입니다 (0.5 = 0.5%)

## 코드 예시

### TypeScript/JavaScript

```typescript
async function getOdosQuote(
  inputTokens: Array<{
    tokenAddress: string;
    amount: string;
  }>,
  outputTokenAddress: string,
  userAddr: string,
  slippageLimitPercent: number = 0.5,
  chainId: number = 8453
) {
  const response = await fetch('https://api.odos.xyz/sor/quote/v3', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chainId,
      inputTokens,
      outputTokens: [
        {
          tokenAddress: outputTokenAddress.toLowerCase(),
        },
      ],
      userAddr: userAddr.toLowerCase(),
      slippageLimitPercent,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Odos quote failed: ${errorData.detail || errorData.message}`);
  }

  return response.json();
}

// 사용 예시
const quote = await getOdosQuote(
  [
    {
      tokenAddress: '0x4200000000000000000000000000000000000006',
      amount: '1000000000000000',
    },
  ],
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
  '0x1234567890123456789012345678901234567890',
  0.5,
  8453
);

console.log('Quote:', quote);
console.log('Path ID:', quote.pathId);
console.log('Output Amount:', quote.outAmounts[0]);
```

### cURL

```bash
curl -X POST https://api.odos.xyz/sor/quote/v3 \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 8453,
    "inputTokens": [
      {
        "tokenAddress": "0x4200000000000000000000000000000000000006",
        "amount": "1000000000000000"
      }
    ],
    "outputTokens": [
      {
        "tokenAddress": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
      }
    ],
    "userAddr": "0x1234567890123456789012345678901234567890",
    "slippageLimitPercent": 0.5
  }'
```

## 에러 처리

### 일반적인 에러 코드

- **400 Bad Request**: 요청 형식 오류
  - `errorCode: 4013`: 같은 토큰을 중복 입력
  - `errorCode: 4001`: 잘못된 토큰 주소
  - `errorCode: 4002`: 잘못된 수량 형식

### 에러 응답 형식

```json
{
  "detail": "에러 메시지",
  "traceId": "추적 ID (null일 수 있음)",
  "errorCode": 4013
}
```

## 다음 단계: Transaction Assemble

Quote API로 받은 `pathId`를 사용하여 실제 트랜잭션을 생성합니다:

```
POST https://api.odos.xyz/sor/assemble
```

```json
{
  "userAddr": "0x1234567890123456789012345678901234567890",
  "pathId": "fc4076ee8a9b57736e1e9a4dddbc749e",
  "slippageLimitPercent": 0.5,
  "chainId": 8453
}
```

응답으로 받은 트랜잭션 데이터를 그대로 사용하여 블록체인에 전송합니다.

