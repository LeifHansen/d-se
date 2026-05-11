import type { CSSProperties, ImgHTMLAttributes } from "react";

export type ResponsivePicture = {
  sources: Record<string, string>;
  img: { src: string; w: number; h: number };
};

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet"> & {
  picture: ResponsivePicture;
  alt: string;
  sizes?: string;
  priority?: boolean;
  pictureClassName?: string;
  pictureStyle?: CSSProperties;
};

const SOURCE_TYPE: Record<string, string> = {
  avif: "image/avif",
  webp: "image/webp",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
};

const ORDER = ["avif", "webp", "jpeg", "jpg", "png"];

export function Image({
  picture,
  alt,
  sizes = "100vw",
  priority = false,
  loading,
  decoding,
  fetchPriority,
  pictureClassName,
  pictureStyle,
  className,
  style,
  ...rest
}: Props) {
  const formats = Object.keys(picture.sources).sort(
    (a, b) => ORDER.indexOf(a) - ORDER.indexOf(b),
  );

  return (
    <picture className={pictureClassName} style={pictureStyle}>
      {formats.map((format) => (
        <source
          key={format}
          type={SOURCE_TYPE[format] ?? `image/${format}`}
          srcSet={picture.sources[format]}
          sizes={sizes}
        />
      ))}
      <img
        {...rest}
        src={picture.img.src}
        width={picture.img.w}
        height={picture.img.h}
        alt={alt}
        loading={loading ?? (priority ? "eager" : "lazy")}
        decoding={decoding ?? "async"}
        fetchPriority={fetchPriority ?? (priority ? "high" : "auto")}
        className={className}
        style={style}
      />
    </picture>
  );
}
