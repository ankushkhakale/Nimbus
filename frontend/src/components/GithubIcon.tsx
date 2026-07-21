import React from "react";

/**
 * GitHub mark as inline SVG.
 *
 * lucide-react dropped brand icons in v1, so importing `Github` from it
 * no longer type-checks or builds. The Google button on these pages is
 * already inline SVG for the same reason.
 */
export function GithubIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M12 .5C5.73.5.99 5.24.99 11.5c0 4.85 3.15 8.96 7.51 10.42.55.1.75-.24.75-.53 0-.26-.01-.95-.01-1.86-3.06.66-3.71-1.48-3.71-1.48-.5-1.27-1.22-1.61-1.22-1.61-1-.68.08-.67.08-.67 1.1.08 1.68 1.13 1.68 1.13.98 1.68 2.57 1.2 3.2.92.1-.71.38-1.2.7-1.48-2.44-.28-5.01-1.22-5.01-5.44 0-1.2.43-2.18 1.13-2.95-.11-.28-.49-1.4.11-2.92 0 0 .92-.29 3.02 1.13a10.5 10.5 0 0 1 5.5 0c2.1-1.42 3.02-1.13 3.02-1.13.6 1.52.22 2.64.11 2.92.7.77 1.13 1.75 1.13 2.95 0 4.23-2.58 5.16-5.03 5.43.4.34.75 1 .75 2.02 0 1.46-.01 2.63-.01 2.99 0 .29.2.64.76.53a10.52 10.52 0 0 0 7.5-10.42C23.01 5.24 18.27.5 12 .5z" />
    </svg>
  );
}
