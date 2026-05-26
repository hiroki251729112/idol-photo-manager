"use client";

import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";

export default function HomePage() {
  const groups = [
    {
      name: "乃木坂46",
      borderClass: "border-purple-500",
      textClass: "text-purple-300",
      description: "乃木坂46 の生写真を管理する",
    },
    {
      name: "櫻坂46",
      borderClass: "border-pink-500",
      textClass: "text-pink-300",
      description: "櫻坂46 の生写真を管理する",
    },
    {
      name: "日向坂46",
      borderClass: "border-sky-500",
      textClass: "text-sky-300",
      description: "日向坂46 の生写真を管理する",
    },
  ];

  return (
    <main className="min-h-screen bg-black text-white px-4 py-5">
      <div className="w-full max-w-md md:max-w-3xl lg:max-w-4xl mx-auto">
        <div className="flex items-start justify-between gap-3 mb-6">
          <div className="min-w-0">
            <h1 className="text-3xl md:text-4xl font-bold">
              生写真管理
            </h1>

            <p className="text-zinc-400 text-sm mt-2">
              管理したいグループを選択してください。
            </p>
          </div>

          <div className="shrink-0 whitespace-nowrap">
            <LogoutButton />
          </div>
        </div>

        <div className="grid gap-4">
          {groups.map((group) => (
            <Link
              key={group.name}
              href={`/select?group=${encodeURIComponent(group.name)}`}
              className={`block bg-zinc-900 border-2 ${group.borderClass} rounded-3xl p-5 active:scale-[0.98] transition`}
            >
              <p className={`text-2xl font-bold ${group.textClass}`}>
                {group.name}
              </p>

              <p className="text-zinc-400 text-sm mt-2">
                {group.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}