import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { navigate } from "./next-navigation";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string | { pathname?: string; query?: Record<string, string> };
  replace?: boolean;
  children?: ReactNode;
};

export default function Link({ href, replace, onClick, target, children, ...props }: LinkProps) {
  const value = typeof href === "string" ? href : `${href.pathname || ""}${href.query ? `?${new URLSearchParams(href.query)}` : ""}`;
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(value, replace);
  };
  return <a {...props} href={value} target={target} onClick={handleClick}>{children}</a>;
}
