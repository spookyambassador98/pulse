// Shared SVG filter for gooey merges (compare toggle, magnetic button fill,
// footer wordmark drips). feGaussianBlur softens, feColorMatrix re-sharpens
// alpha into a hard edge so blobs visually fuse instead of just overlapping.
export function GooDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <filter id="goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -11"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
}
