import type { CSSProperties, ImgHTMLAttributes } from "react";
import {
  buildRuntimePicture,
  type RuntimeFormat,
  type RuntimeWidth,
} from "@/lib/imageUrl";

export type ResponsivePicture = {
  sources: Record<string, string>;
  img: { src: string; w: number; h: number };
};

type CommonProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "srcSet" | "width" | "height"
> & {
  alt: string;
  sizes?: string;
  priority?: boolean;
  pictureClassName?: string;
  pictureStyle?: CSSProperties;
};

type BuildTimeProps = CommonProps & {
  picture: ResponsivePicture;
  src?: never;
  width?: never;
  height?: never;
  widths?: never;
  formats?: never;
  quality?: never;
};

type RuntimeProps = CommonProps & {
  picture?: never;
  src: string;
  width: number;
  height: number;
  widths?: ReadonlyArray<RuntimeWidth>;
  formats?: ReadonlyArray<RuntimeFormat>;
  quality?: number;
};

type Props = BuildTimeProps | RuntimeProps;

const SOURCE_TYPE: Record<string, string> = {
  avif: "image/avif",
  webp: "image/webp",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
};

const ORDER = ["avif", "webp", "jpeg", "jpg", "png"];

export function Image(props: Props) {
  const {
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
  } = props;

  const picture: ResponsivePicture =
    "picture" in props && props.picture
      ? props.picture
      : buildRuntimePicture({
          src: (props as RuntimeProps).src,
          width: (props as RuntimeProps).width,
          height: (props as RuntimeProps).height,
          widths: (props as RuntimeProps).widths,
          formats: (props as RuntimeProps).formats,
          quality: (props as RuntimeProps).quality,
        });

  // Strip the runtime-only props off `rest` so they don't land on the <img>.
  const {
    picture: _p,
    src: _s,
    width: _w,
    height: _h,
    widths: _ws,
    formats: _fs,
    quality: _q,
    ...imgProps
  } = rest as Record<string, unknown>;

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
        {...(imgProps as ImgHTMLAttributes<HTMLImageElement>)}
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
