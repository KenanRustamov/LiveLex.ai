import * as React from "react";

export function DotsScaleIcon({
  size = 24,
  color = "currentColor",
  strokeWidth = 2,
  className,
  ...props
}: React.SVGProps<SVGSVGElement> & {
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <circle cx="4" cy="12" r="3"><animate id="SVG9IgbRbsl" attributeName="r" begin="0;SVGFUNpCWdG.end-0.25s" dur="0.75s" values="3;.2;3"/></circle><circle cx="12" cy="12" r="3"><animate attributeName="r" begin="SVG9IgbRbsl.end-0.6s" dur="0.75s" values="3;.2;3"/></circle><circle cx="20" cy="12" r="3"><animate id="SVGFUNpCWdG" attributeName="r" begin="SVG9IgbRbsl.end-0.45s" dur="0.75s" values="3;.2;3"/></circle>
    </svg>
  );
}
