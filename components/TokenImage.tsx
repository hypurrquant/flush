"use client";
import Image from "next/image";

interface TokenImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
}

export function TokenImage({ src, alt, width = 32, height = 32, className }: TokenImageProps) {
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      unoptimized
    />
  );
}

