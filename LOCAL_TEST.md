# 로컬 테스트 가이드

## 1. 환경 변수 설정

프로젝트 루트에 `.env.local` 파일을 생성하고 다음 내용을 추가하세요:

```bash
# Required: OnchainKit API Key
NEXT_PUBLIC_ONCHAINKIT_API_KEY=your_onchainkit_api_key_here

# Required: Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Required: Application URL (로컬 개발용)
NEXT_PUBLIC_URL=http://localhost:3000
```

**참고**: Supabase가 설정되지 않은 경우, API 호출이 실패할 수 있지만 토큰 잔액 조회와 스왑 기능 자체는 작동합니다.

## 2. 개발 서버 실행

```bash
npm run dev
```

서버가 시작되면 `http://localhost:3000`에서 앱을 확인할 수 있습니다.

## 3. 기능 테스트

### 단계별 테스트:

1. **지갑 연결**
   - Base 네트워크로 연결된 지갑이 필요합니다
   - Base 테스트넷 또는 메인넷에서 테스트 가능

2. **토큰 잔액 조회**
   - 연결된 지갑의 ERC20 토큰 잔액이 자동으로 조회됩니다
   - 현재 지원 토큰: USDC, WETH, DAI

3. **배치 스왑 테스트**
   - 여러 토큰을 보유한 경우, "Swap to USDC" 버튼이 표시됩니다
   - 버튼 클릭 시 Odos API를 통해 스왑 쿼리를 가져옵니다
   - 확인 후 실제 트랜잭션이 실행됩니다

## 4. Odos API 사용

- Odos API는 무료로 사용 가능합니다 (API 키 불필요)
- Base 네트워크(chainId: 8453)에서 자동으로 작동합니다
- 스왑은 Odos의 `/sor/assemble` 엔드포인트를 통해 실행됩니다

## 5. 트러블슈팅

### 문제: "Failed to fetch token balances"
- 원인: Base 네트워크 RPC 연결 문제
- 해결: 지갑이 Base 네트워크에 연결되어 있는지 확인

### 문제: "Odos quote failed"
- 원인: Odos API 호출 실패 또는 토큰 조합 문제
- 해결: 콘솔에서 에러 메시지 확인

### 문제: Supabase 관련 에러
- 원인: Supabase 설정이 없거나 잘못됨
- 해결: `.env.local` 파일의 Supabase 설정 확인

## 6. 다음 단계

로컬에서 정상 작동 확인 후:
1. Vercel에 배포
2. 환경 변수를 프로덕션에 설정
3. Base Build에서 Account Association 설정


