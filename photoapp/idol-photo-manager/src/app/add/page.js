import Link from "next/link";

export default function AddPage() {
  return (
    <main className="min-h-screen bg-black text-white p-6">
      <Link href="/select" className="text-cyan-400 text-sm">
        ← 戻る
      </Link>

      <h1 className="text-2xl font-bold mt-4 mb-6">
        追加・編集
      </h1>

      <div className="grid gap-4">
        <Link
          href="/photo-add"
          className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 text-left block"
        >
          <p className="text-lg font-bold">生写真を追加</p>
          <p className="text-sm text-zinc-400 mt-1">
            所持している写真を登録する
          </p>
        </Link>

        <button className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 text-left">
          <p className="text-lg font-bold">種類を追加・編集</p>
          <p className="text-sm text-zinc-400 mt-1">
            年・衣装名・シリーズを管理する
          </p>
        </button>

        <button className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 text-left">
          <p className="text-lg font-bold">メンバーを追加・編集</p>
          <p className="text-sm text-zinc-400 mt-1">
            メンバー名・期別・画像を管理する
          </p>
        </button>
      </div>
    </main>
  );
}