"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_GROUPS = [
  {
    label: "マスタ",
    items: [
      { href: "/shippers", label: "荷主" },
      { href: "/products", label: "商品" },
      { href: "/locations", label: "ロケーション" },
    ],
  },
  {
    label: "入出庫",
    items: [
      { href: "/transactions", label: "一覧" },
      { href: "/transactions/new?type=in", label: "入庫登録" },
      { href: "/transactions/new?type=out", label: "出庫登録" },
    ],
  },
  {
    label: "在庫照会",
    items: [
      { href: "/inventory", label: "在庫一覧" },
      { href: "/inventory/expiry", label: "賞味期限別" },
    ],
  },
];

export function Header() {
  const pathname = usePathname();

  function isActive(href: string) {
    const path = href.split("?")[0];
    return pathname === path || (path !== "/" && pathname.startsWith(path));
  }

  return (
    <div className="flex items-center gap-8 py-3">
      <Link
        href="/"
        className="text-lg font-bold tracking-tight text-zinc-900"
      >
        LogiSys
      </Link>
      <nav className="flex items-center gap-6">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="group relative">
            <span className="cursor-default text-sm font-medium text-zinc-500">
              {group.label}
            </span>
            <div className="absolute left-0 top-full z-10 hidden min-w-max flex-col rounded-lg border border-zinc-200 bg-white py-1 shadow-md group-hover:flex">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-2 text-sm hover:bg-zinc-50 ${
                    isActive(item.href)
                      ? "font-medium text-blue-600"
                      : "text-zinc-700"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}
