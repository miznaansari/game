"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { auth, googleProvider } from "@/lib/firebase";
import { signInWithPopup } from "firebase/auth";
import { Mail, Lock, Sparkles, Loader2 } from "lucide-react";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      if (errorParam === "expired_token") {
        setError("Your email verification link has expired. Please log in to request a new link.");
      } else if (errorParam === "invalid_token") {
        setError("The verification link is invalid. Please log in to request a new link.");
      } else {
        setError("An authentication error occurred. Please try again.");
      }
    }
  }, [searchParams]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403) {
          setInfo(data.error);
          return;
        }
        throw new Error(data.error || "Login failed");
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setInfo("");
    setLoading(true);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          name: user.displayName,
          photoURL: user.photoURL,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Google sign-in failed");
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 relative overflow-hidden">
      {/* Decorative colorful circles */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] aspect-square rounded-full bg-orange-100/50 blur-3xl -z-10" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50%] aspect-square rounded-full bg-indigo-100/50 blur-3xl -z-10" />

      <div className="w-full max-w-md bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-slate-100 p-8 animate-float">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-3 bg-amber-50 text-amber-600 rounded-xl mb-3">
            <Sparkles className="h-6 w-6 animate-bounce-subtle" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-gradient-orange">Welcome Back</h1>
          <p className="text-slate-500 mt-1 text-sm">Enter the 1v1 Battle Grid Arena</p>
        </div>

        {error && (
          <div className="p-3 mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl font-medium animate-shake">
            {error}
          </div>
        )}

        {info && (
          <div className="p-3 mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl font-medium">
            {info}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Mail className="h-5 w-5" />
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@gmail.com"
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm text-slate-800 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Lock className="h-5 w-5" />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm text-slate-800 transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-xl font-semibold shadow-md shadow-orange-600/10 hover:shadow-orange-600/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              "Log In"
            )}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-slate-50 px-2 text-slate-500 font-semibold">Or continue with</span>
          </div>
        </div>

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-semibold transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <svg className="h-5 w-5" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                <path d="M21.35,11.1H12v2.7h5.38c-0.24,1.28 -0.96,2.37 -2.04,3.1v2.6h3.3c1.93,-1.78 3.04,-4.4 3.04,-7.4C21.68,11.9 21.57,11.5 21.35,11.1z" fill="#4285F4" />
                <path d="M12,20.6c2.6,0 4.78,-0.86 6.38,-2.3l-3.3,-2.6c-0.9,0.6 -2.07,0.98 -3.08,0.98 -3.1,0 -5.73,-2.1 -6.67,-4.9h-3.4v2.6C3.52,18.06 7.46,20.6 12,20.6z" fill="#34A853" />
                <path d="M5.33,11.78c-0.24,-0.72 -0.38,-1.5 -0.38,-2.3c0,-0.8 0.14,-1.58 0.38,-2.3v-2.6H1.93C1.12,6.18 0.67,8.04 0.67,10c0,1.96 0.45,3.82 1.26,5.4L5.33,11.78z" fill="#FBBC05" />
                <path d="M12,4.82c1.4,0 2.68,0.48 3.68,1.43l2.75,-2.75C16.78,2.06 14.6,1.2 12,1.2c-4.54,0 -8.48,2.54 -10.07,6.2l3.4,2.6C6.27,7.18 8.9,5.08 12,4.82z" fill="#EA4335" />
              </svg>
              Sign in with Google
            </>
          )}
        </button>

        <p className="text-center text-sm text-slate-500 mt-6">
          Don't have an account?{" "}
          <Link href="/signup" className="font-semibold text-orange-600 hover:text-orange-700">
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-amber-500 border-t-transparent" />
          <p className="text-slate-500 font-semibold text-sm">Loading Arena...</p>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
