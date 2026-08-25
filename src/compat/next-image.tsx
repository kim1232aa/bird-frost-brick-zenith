import type { CSSProperties, ImgHTMLAttributes } from "react";

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | { src: string };
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
};

export default function Image({ src, fill, priority, unoptimized: _unoptimized, style, ...props }: ImageProps) {
  const fillStyle: CSSProperties | undefined = fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style;
  return <img {...props} src={typeof src === "string" ? src : src.src} style={fillStyle} loading={priority ? "eager" : props.loading} />;
}
