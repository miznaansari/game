"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { 
  ArrowLeft, Send, ShieldAlert, Clock, Sparkles, Loader2, 
  CheckCircle2, AlertCircle 
} from "lucide-react";

export default function AdminClient({ initialCampaigns }) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState(initialCampaigns || []);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, message }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to broadcast notification");
      }

      setSuccess("Push notification campaign successfully broadcast to all players!");
      setTitle("");
      setMessage("");
      
      // Refresh list
      const fetchList = await fetch("/api/admin/campaign");
      if (fetchList.ok) {
        const listData = await fetchList.json();
        setCampaigns(listData);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-12">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            onClick={() => router.push("/")}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition flex items-center gap-1 cursor-pointer font-semibold text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Lobby
          </button>
          
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
              <ShieldAlert className="h-5 w-5 animate-pulse" />
            </div>
            <h1 className="text-lg font-bold text-gradient-orange">Admin Center</h1>
          </div>

          <span className="bg-amber-100 text-amber-800 text-xs px-3 py-1.5 rounded-full font-bold uppercase">
            Admin Auth
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Create Campaign (Left Column) */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
            <Sparkles className="h-5 w-5 text-amber-500 animate-bounce-subtle" />
            <h2 className="text-md font-bold text-slate-900">Broadcast Push Notification</h2>
          </div>

          {error && (
            <div className="p-3 mb-4 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl font-semibold flex items-center gap-1.5 animate-shake">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 mb-4 text-xs text-green-700 bg-green-50 border border-green-100 rounded-xl font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 flex-1 flex flex-col">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Campaign Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Special Weekend Event! ⚔️"
                className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-slate-800 transition"
              />
            </div>

            <div className="flex-1 flex flex-col">
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Campaign Message Body
              </label>
              <textarea
                required
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Log in now to participate in our active 1v1 Battle Grid campaign and compete for the top ranks!"
                className="w-full flex-1 px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-slate-800 transition resize-none min-h-[100px]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-xl font-bold shadow-md shadow-orange-600/10 hover:shadow-orange-600/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Broadcast to Everyone
                </>
              )}
            </button>
          </form>
        </section>

        {/* Campaign History (Right Column) */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
            <Clock className="h-5 w-5 text-slate-400" />
            <h2 className="text-md font-bold text-slate-900">Campaign History</h2>
            <span className="ml-auto bg-slate-100 text-slate-600 text-xs px-2.5 py-0.5 rounded-full font-bold">
              {campaigns.length} Sent
            </span>
          </div>

          {campaigns.length === 0 ? (
            <div className="text-center py-12 text-slate-400 font-medium text-sm">
              No push notification campaigns broadcast yet.
            </div>
          ) : (
            <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
              {campaigns.map((camp) => (
                <div key={camp.id} className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                  <h4 className="font-bold text-sm text-slate-900">{camp.title}</h4>
                  <p className="text-xs text-slate-600 leading-relaxed">{camp.message}</p>
                  <p className="text-[10px] text-slate-400 font-semibold pt-1 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {new Date(camp.sentAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
