/* eslint-disable @next/next/no-img-element -- user uploads + third-party CC images; sizes vary and are already resized server-side */
import type { ImgHTMLAttributes } from "react";

export function Img({ alt, ...props }: ImgHTMLAttributes<HTMLImageElement> & { alt: string }) {
  return <img alt={alt} loading="lazy" decoding="async" {...props} />;
}
