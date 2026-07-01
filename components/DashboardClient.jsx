"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";
import PWAInstallBanner from "./PWAInstallBanner";

export default function DashboardClient({ user, defaultTab = "home" }) {
  const router = useRouter();
  const [friends, setFriends] = useState({ pendingSent: [], pendingReceived: [], accepted: [] });
  const [games, setGames] = useState({ activeGames: [], pastGames: [] });
  
  // Navigation tabs: "home", "friends", "history", "profile"
  const activeTab = defaultTab;
  const setActiveTab = (tabName) => {
    if (tabName === "home") {
      router.push("/");
    } else if (tabName === "friends") {
      router.push("/play");
    } else {
      router.push(`/${tabName}`);
    }
  };
  const [searchQuery, setSearchQuery] = useState("");

  // Form states
  const [friendEmail, setFriendEmail] = useState("");
  const [friendError, setFriendError] = useState("");
  const [friendSuccess, setFriendSuccess] = useState("");
  const [addingFriend, setAddingFriend] = useState(false);
  
  // General states
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState({});
  const [waitingMatchesMap, setWaitingMatchesMap] = useState({});
  const [activeInvite, setActiveInvite] = useState(null);
  const [socket, setSocket] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [inviteTargetId, setInviteTargetId] = useState(null);
  const [notificationsDisabled, setNotificationsDisabled] = useState(false);
  const [inviteGameMode, setInviteGameMode] = useState(null); // BATTLE, MEMORY, TICTACTOE, WORD_GUESS, DOTS
  const [wordCountSelection, setWordCountSelection] = useState(5); // 4, 5, 6
  const [dotsRows, setDotsRows] = useState(4);
  const [dotsCols, setDotsCols] = useState(4);
  const [modalSearchQuery, setModalSearchQuery] = useState("");
  const [currentSlide, setCurrentSlide] = useState(0);

  const [showGemsConfigModal, setShowGemsConfigModal] = useState(false);
  const [gemsPerWin, setGemsPerWin] = useState(50);
  const [gemsPerLoss, setGemsPerLoss] = useState(20);
  const [gemsPerLevel, setGemsPerLevel] = useState(100);

  // Load gems multipliers from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedWin = localStorage.getItem("gems_per_win");
      const savedLoss = localStorage.getItem("gems_per_loss");
      const savedLevel = localStorage.getItem("gems_per_level");
      if (savedWin !== null) setGemsPerWin(Number(savedWin));
      if (savedLoss !== null) setGemsPerLoss(Number(savedLoss));
      if (savedLevel !== null) setGemsPerLevel(Number(savedLevel));
    }
  }, []);

  // Auto-rotating promo banner interval
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev === 0 ? 1 : 0));
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Check browser push notification permission status on mount & focus
  useEffect(() => {
    if (typeof window !== "undefined") {
      const checkPermission = () => {
        if ("Notification" in window) {
          if (Notification.permission !== "granted") {
            setNotificationsDisabled(true);
          } else {
            setNotificationsDisabled(false);
          }
        }
      };

      checkPermission();
      window.addEventListener("focus", checkPermission);
      return () => window.removeEventListener("focus", checkPermission);
    }
  }, []);

  const enableNotifications = () => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) {
      try {
        console.log("[ONESIGNAL] Requesting opt-in from Dashboard...");
        await OneSignal.User.PushSubscription.optIn();
        
        const currentId = OneSignal.User.PushSubscription.id;
        if (currentId && user.id) {
          await fetch("/api/user/onesignal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playerId: currentId }),
          });
          setNotificationsDisabled(false);
        }
      } catch (err) {
        console.error("Error enabling notifications from dashboard:", err);
      }
    });
  };

  // Load friends and games lists
  const fetchData = async () => {
    try {
      const [friendsRes, gamesRes] = await Promise.all([
        fetch("/api/friends"),
        fetch("/api/games/list")
      ]);
      
      const friendsData = await friendsRes.json();
      const gamesData = await gamesRes.json();
      
      if (friendsRes.ok) setFriends(friendsData);
      if (gamesRes.ok) setGames(gamesData);
    } catch (err) {
      console.error("Error loading dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Socket Connection and logic
  useEffect(() => {
    let activeSocket = window.globalSocket;
    if (!activeSocket) {
      const socketUrl = (typeof window !== "undefined" && window.location.hostname === "localhost")
        ? "http://localhost:3001"
        : (process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001");
      activeSocket = io(socketUrl, {
        transports: ["websocket"]
      });
      window.globalSocket = activeSocket;
    }
    setSocket(activeSocket);

    const handleFriendStatus = ({ userId, status }) => {
      setStatuses((prev) => ({ ...prev, [userId]: status }));
    };

    const handleInvite = ({ senderId, senderName, gameId, mode }) => {
      setActiveInvite({ senderId, senderName, gameId, mode: mode || "BATTLE" });
    };

    const handleOpponentWaiting = ({ gameId, opponentId, isWaiting }) => {
      setWaitingMatchesMap((prev) => {
        const next = { ...prev };
        if (isWaiting) {
          next[gameId] = [opponentId];
        } else {
          delete next[gameId];
        }
        return next;
      });
    };

    activeSocket.on("friend-status-changed", handleFriendStatus);
    activeSocket.on("invite-received", handleInvite);
    activeSocket.on("opponent-waiting-status-changed", handleOpponentWaiting);

    // Request online status for all accepted friends
    if (friends.accepted.length > 0) {
      const ids = friends.accepted.map(f => f.friend.id);
      activeSocket.emit("get-online-status", ids, (response) => {
        setStatuses(response);
      });
    }

    return () => {
      activeSocket.off("friend-status-changed", handleFriendStatus);
      activeSocket.off("invite-received", handleInvite);
      activeSocket.off("opponent-waiting-status-changed", handleOpponentWaiting);
    };
  }, [user.id, friends.accepted]);

  // Fetch initial waiting status of opponents for active games
  useEffect(() => {
    if (socket && games.activeGames.length > 0) {
      const activeIds = games.activeGames.map(g => g.id);
      socket.emit("get-waiting-opponents", activeIds, (response) => {
        setWaitingMatchesMap(response || {});
      });
    }
  }, [socket, games.activeGames]);

  const handleAddFriend = async (e) => {
    e.preventDefault();
    setFriendError("");
    setFriendSuccess("");
    setAddingFriend(true);

    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: friendEmail }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to send request");

      setFriendSuccess(data.message || "Friend request sent!");
      setFriendEmail("");
      fetchData();
    } catch (err) {
      setFriendError(err.message);
    } finally {
      setAddingFriend(false);
    }
  };

  const handleFriendResponse = async (friendshipId, action) => {
    setActionLoadingId(friendshipId);
    try {
      const res = await fetch("/api/friends/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendshipId, action }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error("Error responding to friend request:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleInviteToGame = async (receiverId, mode = "BATTLE", wordCount = 5, boxRows = 4, boxCols = 4) => {
    setActionLoadingId(receiverId);
    setInviteTargetId(null);
    setInviteGameMode(null);
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiverId, mode, wordCount, boxRows, boxCols }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send invite");

      // Notify the receiver live through socket if connected
      if (socket) {
        socket.emit("send-invite", {
          senderId: user.id,
          senderName: user.name || user.email,
          receiverId,
          gameId: data.gameId,
          mode,
        });
      }

      router.push(`/game/${data.gameId}`);
    } catch (err) {
      alert(err.message);
      setActionLoadingId(null);
    }
  };

  const handleLogout = async () => {
    setActionLoadingId("logout");
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        router.push("/login");
        router.refresh();
      }
    } catch (err) {
      console.error("Logout error:", err);
      setActionLoadingId(null);
    }
  };

  // Helper Stats Calculations
  const waitingMatch = games.activeGames.map(g => {
    const opponent = g.player1Id === user.id ? g.player2 : g.player1;
    const isWaiting = waitingMatchesMap[g.id] && waitingMatchesMap[g.id].includes(opponent.id);
    return isWaiting ? { gameId: g.id, opponentName: opponent.name || opponent.email.split("@")[0], mode: g.mode } : null;
  }).find(Boolean);

  const onlineFriendsCount = friends.accepted.filter(f => statuses[f.friend.id] !== undefined ? statuses[f.friend.id] === "online" : f.friend.isOnline).length;
  const winsCount = games.pastGames.filter(g => g.winnerId === user.id).length;
  const lossesCount = games.pastGames.filter(g => g.winnerId && g.winnerId !== user.id).length;
  const currentLevel = 1 + games.pastGames.length;
  const gemsCount = (winsCount * gemsPerWin) + (lossesCount * gemsPerLoss) + (currentLevel * gemsPerLevel);
  const xpProgress = Math.min(100, Math.floor(((games.pastGames.length % 5) / 5) * 100));

  // Filter accepted friends
  const filteredFriends = friends.accepted.filter(({ friend }) => {
    const name = (friend.name || "").toLowerCase();
    const email = (friend.email || "").toLowerCase();
    const query = searchQuery.toLowerCase();
    return name.includes(query) || email.includes(query);
  });

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-on-background font-body pb-24 gaming-pattern flex flex-col relative overflow-hidden">
      {/* Glossymorphic Floating Blur Blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[10%] left-[5%] w-72 h-72 rounded-full bg-primary/10 blur-[80px] animate-pulse" style={{ animationDuration: '8s' }}></div>
        <div className="absolute top-[35%] right-[-10%] w-96 h-96 rounded-full bg-secondary/10 blur-[100px] animate-pulse" style={{ animationDuration: '10s' }}></div>
        <div className="absolute bottom-[20%] left-[-5%] w-80 h-80 rounded-full bg-pink-500/5 blur-[90px] animate-pulse" style={{ animationDuration: '6s' }}></div>
        <div className="absolute bottom-[5%] right-[10%] w-72 h-72 rounded-full bg-emerald-500/5 blur-[90px] animate-pulse" style={{ animationDuration: '12s' }}></div>
      </div>

      {actionLoadingId === "logout" && (
        <div className="glass-overlay z-[100]">
          <div className="radar-spinner"></div>
          <p className="font-display font-extrabold text-sm text-primary animate-pulse">Logging out safely...</p>
        </div>
      )}

      {/* Live invitation overlay banner */}
      {activeInvite && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md bg-white border border-primary/20 rounded-2xl shadow-xl p-5 animate-bounce-subtle flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">sports_esports</span>
            </div>
            <div>
              <h4 className="font-display font-extrabold text-sm text-on-background">1v1 Challenge!</h4>
              <p className="text-xs text-on-surface-variant mt-0.5">
                <span className="font-bold text-primary">{activeInvite.senderName}</span> wants to play <span className="font-extrabold text-secondary">
                  {activeInvite.mode === "MEMORY" 
                    ? "Emoji Memory Match 🧩" 
                    : (activeInvite.mode === "TICTACTOE" 
                      ? "Tic Tac Toe ❌⭕" 
                      : (activeInvite.mode === "WORD_GUESS" ? "Word Guess 📝" : "Grid Battleship 🎯"))}
                </span>.
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setActiveInvite(null)}
              className="px-4 py-1.5 bg-surface-container text-on-surface-variant font-bold text-xs rounded-xl transition cursor-pointer active-scale"
            >
              Decline
            </button>
            <button
              onClick={() => {
                const gid = activeInvite.gameId;
                setActiveInvite(null);
                router.push(`/game/${gid}`);
              }}
              className="px-4 py-1.5 glossy-primary text-white font-bold text-xs rounded-xl shadow-md transition cursor-pointer active-scale"
            >
              Accept Battle
            </button>
          </div>
        </div>
      )}

      {/* Gems Config settings Modal */}
      {showGemsConfigModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 max-w-sm w-full shadow-2xl flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h3 className="font-display font-black text-lg text-slate-800 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-tertiary">diamond</span>
                Gems Settings
              </h3>
              <button 
                onClick={() => setShowGemsConfigModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 active-scale cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              Customize the multiplier formula to calculate your total Gems dynamically. Changes are saved instantly.
            </p>

            <div className="space-y-4">
              {/* Wins multiplier */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-slate-600 font-extrabold uppercase tracking-wider">Gems per Win</label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    min="0"
                    value={gemsPerWin}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setGemsPerWin(val);
                      localStorage.setItem("gems_per_win", val);
                    }}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl text-sm focus:outline-none text-slate-700 font-bold"
                  />
                  <span className="absolute right-3.5 text-[10px] text-slate-400 font-bold">x {winsCount} wins</span>
                </div>
              </div>

              {/* Losses multiplier */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-slate-600 font-extrabold uppercase tracking-wider">Gems per Loss</label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    min="0"
                    value={gemsPerLoss}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setGemsPerLoss(val);
                      localStorage.setItem("gems_per_loss", val);
                    }}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl text-sm focus:outline-none text-slate-700 font-bold"
                  />
                  <span className="absolute right-3.5 text-[10px] text-slate-400 font-bold">x {lossesCount} losses</span>
                </div>
              </div>

              {/* Level multiplier */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-slate-600 font-extrabold uppercase tracking-wider">Gems per Level</label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    min="0"
                    value={gemsPerLevel}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setGemsPerLevel(val);
                      localStorage.setItem("gems_per_level", val);
                    }}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl text-sm focus:outline-none text-slate-700 font-bold"
                  />
                  <span className="absolute right-3.5 text-[10px] text-slate-400 font-bold">x {currentLevel} levels</span>
                </div>
              </div>
            </div>

            {/* Preview Section */}
            <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 flex flex-col gap-1">
              <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest">Calculated Preview</span>
              <div className="flex justify-between items-center mt-1">
                <div className="text-xs text-slate-600 font-bold">
                  ({winsCount} x {gemsPerWin}) + ({lossesCount} x {gemsPerLoss}) + ({currentLevel} x {gemsPerLevel})
                </div>
                <div className="font-display font-black text-sm text-indigo-600 flex items-center gap-0.5">
                  <span className="material-symbols-outlined text-[16px] text-tertiary">diamond</span>
                  {gemsCount.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setGemsPerWin(50);
                  setGemsPerLoss(20);
                  setGemsPerLevel(100);
                  localStorage.removeItem("gems_per_win");
                  localStorage.removeItem("gems_per_loss");
                  localStorage.removeItem("gems_per_level");
                }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-display font-bold text-xs active-scale transition cursor-pointer"
              >
                Reset Default
              </button>
              <button
                onClick={() => setShowGemsConfigModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-display font-black text-xs active-scale transition shadow-md cursor-pointer"
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Select Game Mode Modal */}
      {inviteTargetId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 max-w-sm w-full shadow-2xl flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <h3 className="font-display font-black text-lg text-slate-800">Select Game Mode</h3>
              <button 
                onClick={() => setInviteTargetId(null)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 active-scale cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            
            <p className="text-xs text-slate-500 font-semibold">Choose which game mode to challenge your friend to:</p>

            <div className="flex flex-col gap-3">
              {/* Option 1: Battleship */}
              <button
                onClick={() => handleInviteToGame(inviteTargetId, "BATTLE")}
                className="flex items-center gap-3 p-4 rounded-2xl border-2 border-slate-100 hover:border-indigo-500/40 bg-slate-50/50 hover:bg-indigo-50/40 text-left transition active-scale cursor-pointer w-full"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[24px]">target</span>
                </div>
                <div className="flex-1">
                  <h4 className="font-display font-extrabold text-sm text-slate-800">Grid Battleship</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">Hide ships and strike enemy coordinates.</p>
                </div>
              </button>

              {/* Option 2: Memory Match */}
              <button
                onClick={() => handleInviteToGame(inviteTargetId, "MEMORY")}
                className="flex items-center gap-3 p-4 rounded-2xl border-2 border-slate-100 hover:border-fuchsia-500/40 bg-slate-50/50 hover:bg-fuchsia-50/40 text-left transition active-scale cursor-pointer w-full"
              >
                <div className="w-10 h-10 rounded-xl bg-fuchsia-100 text-fuchsia-600 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[24px]">extension</span>
                </div>
                <div className="flex-1">
                  <h4 className="font-display font-extrabold text-sm text-slate-800">Emoji Memory Match</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">Flip and match identical emoji pairs.</p>
                </div>
              </button>

              {/* Option 3: Tic Tac Toe */}
              <button
                onClick={() => handleInviteToGame(inviteTargetId, "TICTACTOE")}
                className="flex items-center gap-3 p-4 rounded-2xl border-2 border-slate-100 hover:border-amber-500/40 bg-slate-50/50 hover:bg-amber-50/40 text-left transition active-scale cursor-pointer w-full"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[24px]">grid_3x3</span>
                </div>
                <div className="flex-1">
                  <h4 className="font-display font-extrabold text-sm text-slate-800">Tic Tac Toe</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">Place X and O in 3-in-a-row classic match.</p>
                </div>
              </button>

              {/* Option 4: Word Guess */}
              <div className="flex flex-col gap-2 p-4 rounded-2xl border-2 border-slate-100 hover:border-emerald-500/40 bg-slate-50/50 hover:bg-emerald-50/30 transition">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-[24px]">notes</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-display font-extrabold text-sm text-slate-800">Word Guess</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">Set a chain of connected words. Guess each other's secret chain!</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-1">
                  {[4, 5, 6].map((count) => (
                    <button
                      key={count}
                      onClick={() => handleInviteToGame(inviteTargetId, "WORD_GUESS", count)}
                      className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-display font-extrabold text-xs active-scale cursor-pointer transition shadow-sm"
                    >
                      {count} Words
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Select Friend Modal (Game-First Invite Flow) */}
      {inviteGameMode && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 max-w-md w-full shadow-2xl flex flex-col gap-4 max-h-[90vh]">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-display font-black text-lg text-slate-800 flex items-center gap-1.5">
                  Challenge Friends 🎮
                </h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                  Arena: {inviteGameMode === "MEMORY" ? "🧩 Memory Match" : (inviteGameMode === "TICTACTOE" ? "❌⭕ Tic Tac Toe" : (inviteGameMode === "WORD_GUESS" ? "📝 Word Guess" : (inviteGameMode === "DOTS" ? "🎮 Dots & Boxes" : "🎯 Grid Battleship")))}
                </p>
              </div>
              <button 
                onClick={() => {
                  setInviteGameMode(null);
                  setModalSearchQuery("");
                }}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 active-scale cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Dots & Boxes Configuration Sub-selection */}
            {inviteGameMode === "DOTS" && (
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-3.5 flex flex-col gap-2.5">
                <span className="text-[10px] text-indigo-800 font-extrabold uppercase tracking-wider">Configure Grid Size</span>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wide">Rows (Height)</label>
                    <div className="flex items-center gap-1.5">
                      <button 
                        type="button"
                        onClick={() => setDotsRows(r => Math.max(2, r - 1))}
                        className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-extrabold text-xs active-scale cursor-pointer"
                      >
                        -
                      </button>
                      <input 
                        type="number"
                        min="2"
                        max="10"
                        value={dotsRows}
                        onChange={(e) => setDotsRows(Math.min(10, Math.max(2, parseInt(e.target.value) || 4)))}
                        className="w-10 text-center bg-white border border-slate-200 rounded-lg py-0.5 text-xs font-black text-slate-800 focus:outline-none"
                      />
                      <button 
                        type="button"
                        onClick={() => setDotsRows(r => Math.min(10, r + 1))}
                        className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-extrabold text-xs active-scale cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wide">Cols (Width)</label>
                    <div className="flex items-center gap-1.5">
                      <button 
                        type="button"
                        onClick={() => setDotsCols(c => Math.max(2, c - 1))}
                        className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-extrabold text-xs active-scale cursor-pointer"
                      >
                        -
                      </button>
                      <input 
                        type="number"
                        min="2"
                        max="10"
                        value={dotsCols}
                        onChange={(e) => setDotsCols(Math.min(10, Math.max(2, parseInt(e.target.value) || 4)))}
                        className="w-10 text-center bg-white border border-slate-200 rounded-lg py-0.5 text-xs font-black text-slate-800 focus:outline-none"
                      />
                      <button 
                        type="button"
                        onClick={() => setDotsCols(c => Math.min(10, c + 1))}
                        className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-extrabold text-xs active-scale cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Word Guess Word Count Sub-selection */}
            {inviteGameMode === "WORD_GUESS" && (
              <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-3.5 flex flex-col gap-2">
                <span className="text-[10px] text-emerald-800 font-extrabold uppercase tracking-wider">Configure Word List Length</span>
                <div className="flex gap-2">
                  {[4, 5, 6].map((count) => (
                    <button
                      key={count}
                      onClick={() => setWordCountSelection(count)}
                      className={`flex-grow py-2 rounded-xl font-display font-extrabold text-xs active-scale transition-all border ${
                        wordCountSelection === count
                          ? "bg-emerald-600 border-emerald-600 text-white shadow-sm font-black"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {count} Words
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Friend Search Input */}
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
              <input
                type="text"
                placeholder="Search squad friends..."
                value={modalSearchQuery}
                onChange={(e) => setModalSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/20 text-slate-700 font-semibold"
              />
            </div>

            {/* Friends list scrollable area */}
            <div className="flex-grow overflow-y-auto space-y-2.5 max-h-[45vh] pr-1">
              {friends.accepted.filter(({ friend }) => {
                const name = (friend.name || "").toLowerCase();
                const email = (friend.email || "").toLowerCase();
                const q = modalSearchQuery.toLowerCase();
                return name.includes(q) || email.includes(q);
              }).length === 0 ? (
                <div className="text-center py-8 text-slate-400 font-bold text-xs bg-slate-50/50 border border-slate-100 rounded-2xl">
                  {friends.accepted.length === 0 ? "Add friends in the Friends tab to challenge them!" : "No matching friends found."}
                </div>
              ) : (
                friends.accepted
                  .filter(({ friend }) => {
                    const name = (friend.name || "").toLowerCase();
                    const email = (friend.email || "").toLowerCase();
                    const q = modalSearchQuery.toLowerCase();
                    return name.includes(q) || email.includes(q);
                  })
                  .map(({ friendshipId, friend }) => {
                    const isOnline = statuses[friend.id] !== undefined ? statuses[friend.id] === "online" : friend.isOnline;
                    return (
                      <div 
                        key={friendshipId} 
                        className="flex items-center justify-between p-2 rounded-2xl border border-slate-100 hover:bg-slate-50/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 overflow-hidden mr-2">
                          <div className="relative shrink-0">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 text-white font-display font-extrabold text-sm uppercase flex items-center justify-center">
                              {friend.name ? friend.name[0] : friend.email[0]}
                            </div>
                            <span className={`absolute bottom-[-2px] right-[-2px] w-3 h-3 border-2 border-white rounded-full ${
                              isOnline ? "bg-emerald-500" : "bg-slate-300"
                            }`}></span>
                          </div>
                          <div className="overflow-hidden">
                            <h4 className="font-bold text-xs text-slate-800 truncate leading-tight">
                              {friend.name || friend.email.split("@")[0]}
                            </h4>
                            <p className="text-[9px] text-slate-400 font-semibold truncate mt-0.5">{friend.email}</p>
                          </div>
                        </div>

                        <button
                          disabled={actionLoadingId === friend.id}
                          onClick={() => handleInviteToGame(friend.id, inviteGameMode, wordCountSelection, dotsRows, dotsCols)}
                          className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-display font-black text-xs active-scale shadow-sm shrink-0 flex items-center justify-center min-w-[64px]"
                        >
                          {actionLoadingId === friend.id ? (
                            <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                          ) : (
                            "Invite"
                          )}
                        </button>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      )}

      {/* TopAppBar */}
      <header className="sticky top-0 z-40 bg-white/40 backdrop-blur-xl border border-white/30 rounded-2xl mx-5 mt-3 shadow-lg flex justify-between items-center px-4 py-2 h-14 relative z-40">
        <div className="flex items-center gap-3">
          <div 
            onClick={() => setActiveTab("profile")}
            className="w-9 h-9 rounded-full border border-white/50 overflow-hidden active-scale cursor-pointer flex items-center justify-center bg-gradient-to-tr from-primary to-secondary text-white font-display font-extrabold text-sm uppercase shadow-sm"
          >
            {user.name ? user.name[0] : (user.email ? user.email[0] : "U")}
          </div>
          <h1 className="font-display text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-primary via-secondary to-pink-500 tracking-tight">GamerHub</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-white/50 hover:bg-white/80 border border-white/50 px-3 py-1.5 rounded-full flex items-center gap-1 active-scale cursor-pointer transition-colors shadow-sm" onClick={() => setShowGemsConfigModal(true)} title="Gems Multiplier Settings">
            <span className="material-symbols-outlined text-tertiary text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>diamond</span>
            <span className="font-display font-black text-xs text-on-surface">{gemsCount.toLocaleString()} Gems</span>
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            className="w-8 h-8 rounded-full bg-red-500/10 text-red-600 flex items-center justify-center active-scale transition-all border border-red-500/20 cursor-pointer hover:bg-red-500 hover:text-white"
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
          </button>
        </div>
      </header>

      {/* Main Canvas Container */}
      <main className="flex-grow px-5 pt-5 max-w-2xl mx-auto w-full relative">
        {/* Kid-friendly Bobbing Sticker Animations */}
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes bobbing {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-8px) rotate(3deg); }
          }
          @keyframes floating {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-6px) rotate(-3deg); }
          }
          .sticker-doraemon {
            animation: bobbing 4s ease-in-out infinite;
          }
          .sticker-ninja {
            animation: floating 3.5s ease-in-out infinite;
          }
        `}} />
        {loading ? (
          <div className="space-y-6 animate-pulse">
            <section className="space-y-2">
              <div className="h-4 w-24 skeleton-box rounded"></div>
              <div className="h-8 w-48 skeleton-box rounded"></div>
            </section>
            
            <div className="grid grid-cols-1 gap-4">
              <div className="h-60 rounded-2xl skeleton-box opacity-70"></div>
              <div className="h-60 rounded-2xl skeleton-box opacity-70"></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="h-44 rounded-2xl skeleton-box opacity-70"></div>
                <div className="h-44 rounded-2xl skeleton-box opacity-70"></div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* TAB 1: HOME */}
            {activeTab === "home" && (
              <div className="space-y-6">
                {/* Push Notification Warning Alert */}
                {notificationsDisabled && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between gap-4 shadow-sm">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined font-bold text-[20px]">notifications_off</span>
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-display font-extrabold text-xs text-on-surface">Enable Push Notifications</h4>
                        <p className="text-[10px] font-medium text-on-surface-variant leading-relaxed mt-0.5">
                          Turn on notifications to receive live challenges, game invites, and chat messages in real-time.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={enableNotifications}
                      className="px-3 py-1 bg-amber-500 text-white text-xs font-bold rounded-lg active-scale transition-transform cursor-pointer shrink-0 hover:bg-amber-600 shadow-sm"
                    >
                      Enable
                    </button>
                  </div>
                )}

                {/* Game Resume Option (Pulsing glowing alert) */}
                {waitingMatch && (
                  <div 
                    onClick={() => router.push(`/game/${waitingMatch.gameId}`)}
                    className="bg-gradient-to-r from-emerald-500/15 via-emerald-600/10 to-emerald-500/15 border-2 border-emerald-500/40 rounded-2xl p-4 flex items-center justify-between gap-4 shadow-lg animate-pulse cursor-pointer active-scale hover:border-emerald-500 transition-all duration-300"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/25 text-emerald-600 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined font-bold text-[24px]">sports_esports</span>
                      </div>
                      <div className="min-w-0">
                        <span className="bg-emerald-50 text-emerald-700 text-[8px] font-black px-2 py-0.5 rounded-full mb-1 inline-block uppercase tracking-wider bg-emerald-500/15">ACTIVE MATCH</span>
                        <h4 className="font-display font-extrabold text-xs text-on-surface">
                          <span className="text-emerald-600 font-black">{waitingMatch.opponentName}</span> is waiting for you!
                        </h4>
                        <p className="text-[10px] font-bold text-on-surface-variant leading-relaxed mt-0.5">
                          Join the {waitingMatch.mode === "MEMORY" ? "Emoji Memory Match" : (waitingMatch.mode === "TICTACTOE" ? "Tic Tac Toe" : (waitingMatch.mode === "WORD_GUESS" ? "Word Guess" : "Grid Battleship"))} game now to resume.
                        </p>
                      </div>
                    </div>
                    <button
                      className="px-3.5 py-2 bg-emerald-500 text-white text-xs font-black rounded-xl active-scale shrink-0 hover:bg-emerald-600 shadow-md flex items-center gap-1 cursor-pointer"
                    >
                      Join
                      <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                    </button>
                  </div>
                )}

                {/* Welcome section */}
                <section className="space-y-1">
                  <p className="text-on-surface-variant font-bold text-xs uppercase tracking-wider">Welcome back,</p>
                  <h2 className="font-display text-2xl font-extrabold text-on-surface">{user.name || user.email.split("@")[0]}</h2>
                </section>

                <PWAInstallBanner />

                {/* Redesigned Games Arena Selector */}
                <div className="space-y-3">
                  <h3 className="font-display text-sm font-extrabold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px] text-primary">sports_esports</span>
                    Select Game Arena
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    {/* Game 1: Grid Battleship */}
                    <div 
                      onClick={() => setInviteGameMode("BATTLE")}
                      className="relative overflow-hidden rounded-3xl card-shadow bg-gradient-to-br from-blue-500/20 via-indigo-500/10 to-purple-600/20 backdrop-blur-md p-4 h-48 flex flex-col justify-between active-scale transition-all hover:shadow-indigo-500/30 hover:shadow-2xl hover:-translate-y-1 cursor-pointer group border border-white/50"
                    >
                      <div className="absolute top-[-10px] right-[-10px] opacity-10 group-hover:scale-110 transition-transform duration-300">
                        <span className="material-symbols-outlined text-[100px] text-indigo-600">target</span>
                      </div>
                      {/* Floating Ninja Hattori Sticker */}
                      <img 
                        src="/ninja_hattori_sticker.png" 
                        alt="Ninja" 
                        className="absolute right-2 bottom-2 w-14 h-14 object-contain sticker-ninja pointer-events-none drop-shadow-md z-10" 
                      />
                      <div>
                        <span className="bg-indigo-100 text-indigo-800 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider border border-indigo-200/50">Tactical</span>
                        <h4 className="text-indigo-900 font-display text-base font-black mt-2 flex items-center gap-1">Grid Battleship 🎯</h4>
                        <p className="text-slate-600 text-[10px] font-bold mt-1 max-w-[170px] leading-relaxed">Hide ships and strike enemy coordinates.</p>
                      </div>
                      <span className="text-[9px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200/50 self-start px-3 py-1 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">PLAY NOW</span>
                    </div>

                    {/* Game 2: Emoji Memory Match */}
                    <div 
                      onClick={() => setInviteGameMode("MEMORY")}
                      className="relative overflow-hidden rounded-3xl card-shadow bg-gradient-to-br from-pink-500/20 via-fuchsia-500/10 to-purple-600/20 backdrop-blur-md p-4 h-48 flex flex-col justify-between active-scale transition-all hover:shadow-fuchsia-500/30 hover:shadow-2xl hover:-translate-y-1 cursor-pointer group border border-white/50"
                    >
                      <div className="absolute top-[-10px] right-[-10px] opacity-10 group-hover:scale-110 transition-transform duration-300">
                        <span className="material-symbols-outlined text-[100px] text-fuchsia-600">extension</span>
                      </div>
                      <div>
                        <span className="bg-fuchsia-100 text-fuchsia-800 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider border border-fuchsia-200/50">Mind Puzzles</span>
                        <h4 className="text-fuchsia-900 font-display text-base font-black mt-2 flex items-center gap-1">Memory Match 🧩</h4>
                        <p className="text-slate-600 text-[10px] font-bold mt-1 max-w-[170px] leading-relaxed">Flip cards and match emoji pairs quickly.</p>
                      </div>
                      <span className="text-[9px] font-black text-fuchsia-700 bg-fuchsia-50 border border-fuchsia-200/50 self-start px-3 py-1 rounded-xl group-hover:bg-fuchsia-600 group-hover:text-white transition-all shadow-sm">PLAY NOW</span>
                    </div>

                    {/* Game 3: Tic Tac Toe */}
                    <div 
                      onClick={() => setInviteGameMode("TICTACTOE")}
                      className="relative overflow-hidden rounded-3xl card-shadow bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-yellow-600/20 backdrop-blur-md p-4 h-48 flex flex-col justify-between active-scale transition-all hover:shadow-amber-500/30 hover:shadow-2xl hover:-translate-y-1 cursor-pointer group border border-white/50"
                    >
                      <div className="absolute top-[-10px] right-[-10px] opacity-10 group-hover:scale-110 transition-transform duration-300">
                        <span className="material-symbols-outlined text-[100px] text-amber-600">grid_3x3</span>
                      </div>
                      <div>
                        <span className="bg-amber-100 text-amber-800 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider border border-amber-200/50">Strategy</span>
                        <h4 className="text-amber-900 font-display text-base font-black mt-2 flex items-center gap-1">Tic Tac Toe ❌⭕</h4>
                        <p className="text-slate-600 text-[10px] font-bold mt-1 max-w-[170px] leading-relaxed">Align three symbols classic duel.</p>
                      </div>
                      <span className="text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200/50 self-start px-3 py-1 rounded-xl group-hover:bg-amber-600 group-hover:text-white transition-all shadow-sm">PLAY NOW</span>
                    </div>

                    {/* Game 4: Word Guess */}
                    <div 
                      onClick={() => setInviteGameMode("WORD_GUESS")}
                      className="relative overflow-hidden rounded-3xl card-shadow bg-gradient-to-br from-emerald-500/20 via-teal-500/10 to-cyan-600/20 backdrop-blur-md p-4 h-48 flex flex-col justify-between active-scale transition-all hover:shadow-emerald-500/30 hover:shadow-2xl hover:-translate-y-1 cursor-pointer group border border-white/50"
                    >
                      <div className="absolute top-[-10px] right-[-10px] opacity-10 group-hover:scale-110 transition-transform duration-300">
                        <span className="material-symbols-outlined text-[100px] text-emerald-600">notes</span>
                      </div>
                      {/* Floating Doraemon Sticker */}
                      <img 
                        src="/doraemon_sticker.png" 
                        alt="Doraemon" 
                        className="absolute right-2 bottom-2 w-14 h-14 object-contain sticker-doraemon pointer-events-none drop-shadow-md z-10" 
                      />
                      <div>
                        <span className="bg-emerald-100 text-emerald-800 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider border border-emerald-200/50">Social AI</span>
                        <h4 className="text-emerald-900 font-display text-base font-black mt-2 flex items-center gap-1">Word Guess 📝</h4>
                        <p className="text-slate-600 text-[10px] font-bold mt-1 max-w-[170px] leading-relaxed">Build word chains and guess opponent secret list.</p>
                      </div>
                      <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200/50 self-start px-3 py-1 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-sm">PLAY NOW</span>
                    </div>

                    {/* Game 5: Dots & Boxes */}
                    <div 
                      onClick={() => setInviteGameMode("DOTS")}
                      className="relative overflow-hidden rounded-3xl card-shadow bg-gradient-to-br from-indigo-500/20 via-violet-500/10 to-purple-600/20 backdrop-blur-md p-4 h-48 flex flex-col justify-between active-scale transition-all hover:shadow-indigo-500/30 hover:shadow-2xl hover:-translate-y-1 cursor-pointer group border border-white/50"
                    >
                      <div className="absolute top-[-10px] right-[-10px] opacity-10 group-hover:scale-110 transition-transform duration-300">
                        <span className="material-symbols-outlined text-[100px] text-indigo-600">grid_on</span>
                      </div>
                      <div>
                        <span className="bg-indigo-100 text-indigo-800 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider border border-indigo-200/50">Tactical Strategy</span>
                        <h4 className="text-indigo-900 font-display text-base font-black mt-2 flex items-center gap-1">Dots & Boxes 🎮</h4>
                        <p className="text-slate-600 text-[10px] font-bold mt-1 max-w-[170px] leading-relaxed">Connect dots to capture boxes on a custom grid size.</p>
                      </div>
                      <span className="text-[9px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200/50 self-start px-3 py-1 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm">PLAY NOW</span>
                    </div>
                  </div>
                </div>

                {/* Split Row for Match History and Progress */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Match History Card (Frosted Orange/Red Glass) */}
                  <div className="relative overflow-hidden rounded-2xl card-shadow bg-gradient-to-br from-orange-500/20 via-red-500/10 to-rose-600/20 backdrop-blur-md border border-white/50 p-5 h-44 flex flex-col justify-between active-scale transition-all hover:shadow-orange-500/30 hover:-translate-y-1 cursor-pointer group">
                    <div className="absolute top-[-10px] right-[-10px] opacity-25 group-hover:scale-105 transition-transform">
                      <span className="material-symbols-outlined text-[80px] text-orange-600">history</span>
                    </div>
                    <div>
                      <h3 className="text-orange-950 font-display text-base font-black">Battle History</h3>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className="bg-orange-100 text-orange-800 border border-orange-200/50 text-[9px] font-black px-2.5 py-0.5 rounded-md">
                          {winsCount} Wins
                        </span>
                        <span className="bg-white/40 text-slate-700 border border-white/50 text-[9px] font-black px-2.5 py-0.5 rounded-md">
                          {lossesCount} Losses
                        </span>
                      </div>
                    </div>
                    <button 
                      onClick={() => setActiveTab("history")}
                      className="w-full h-8 rounded-xl bg-gradient-to-r from-orange-600 to-red-600 text-white font-display font-black text-xs flex items-center justify-center cursor-pointer transition shadow-md active-scale"
                    >
                      Stats
                    </button>
                  </div>

                  {/* Profile Card (Modern Glass Container) */}
                  <div className="relative overflow-hidden rounded-2xl card-shadow bg-gradient-to-br from-blue-500/20 via-indigo-500/10 to-purple-600/20 backdrop-blur-md border border-white/50 p-5 h-44 flex flex-col justify-between active-scale transition-all hover:shadow-indigo-500/30 hover:-translate-y-1 cursor-pointer group">
                    <div className="absolute top-[-10px] right-[-10px] opacity-25 group-hover:scale-105 transition-transform">
                      <span className="material-symbols-outlined text-[80px] text-indigo-600">person</span>
                    </div>
                    <div className="flex items-center gap-2 relative">
                      <div className="w-9 h-9 rounded-lg bg-white/60 border border-white/80 flex items-center justify-center shadow-inner text-primary-container font-display font-extrabold text-sm shrink-0">
                        🏆
                      </div>
                      <div>
                        <h3 className="text-slate-800 font-display text-sm font-black leading-none">Level {currentLevel}</h3>
                        <p className="text-slate-500 text-[9px] font-bold mt-1 uppercase tracking-wider">Master Guardian</p>
                      </div>
                    </div>
                    <div className="space-y-1 relative">
                      <div className="flex justify-between text-[9px] font-black text-slate-500 uppercase tracking-wider">
                        <span>XP Progress</span>
                        <span>{xpProgress}%</span>
                      </div>
                      <div className="w-full h-2 bg-white/40 border border-white/60 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-primary to-secondary relative" style={{ width: `${xpProgress}%` }}>
                          <div className="absolute inset-0 bg-white/20" style={{ clipPath: "polygon(0 0, 100% 0, 80% 100%, 0% 100%)" }}></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Auto-swiping Carousel Promo Banner */}
                <section className="mb-6 overflow-hidden rounded-3xl card-shadow border border-white/50 relative bg-white/20 backdrop-blur-md">
                  <div 
                    className="flex transition-transform duration-500 ease-out" 
                    style={{ transform: `translateX(-${currentSlide * 100}%)` }}
                  >
                    {/* Slide 1: Direct Chat */}
                    <div className="w-full flex-shrink-0 bg-gradient-to-tr from-indigo-500/20 via-purple-500/10 to-indigo-600/25 p-5 relative overflow-hidden flex flex-col justify-between min-h-[140px]">
                      <div className="absolute -top-12 -right-12 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl"></div>
                      <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl"></div>
                      
                      <div className="relative flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <span className="bg-indigo-100 text-indigo-800 border border-indigo-200/50 text-[8px] font-black px-2 py-0.5 rounded-full mb-2 inline-block uppercase tracking-wider">New Feature</span>
                          <h4 className="font-display font-black text-slate-850 text-base mb-1">Direct Chat & Invites</h4>
                          <p className="text-slate-600 text-xs leading-relaxed max-w-[240px]">
                            Chat in real-time with your squad and challenge them directly from your chat conversation logs!
                          </p>
                        </div>
                        <button
                          onClick={() => router.push("/chats")}
                          className="w-11 h-11 rounded-2xl bg-white/70 hover:bg-white text-indigo-600 flex items-center justify-center active-scale transition-all border border-white shadow-md hover:shadow-lg shrink-0"
                        >
                          <span className="material-symbols-outlined text-[20px] font-bold">chat</span>
                        </button>
                      </div>
                    </div>

                    {/* Slide 2: Tic Tac Toe */}
                    <div className="w-full flex-shrink-0 bg-gradient-to-tr from-amber-500/20 via-orange-500/10 to-red-500/25 p-5 relative overflow-hidden flex flex-col justify-between min-h-[140px]">
                      <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl"></div>
                      <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-red-500/10 rounded-full blur-2xl"></div>
                      
                      <div className="relative flex items-center justify-between gap-4">
                        <div className="flex-1">
                          <span className="bg-amber-100 text-amber-800 border border-amber-200/50 text-[8px] font-black px-2 py-0.5 rounded-full mb-2 inline-block uppercase tracking-wider">Hot Game</span>
                          <h4 className="font-display font-black text-slate-850 text-base mb-1">Tic Tac Toe is Live!</h4>
                          <p className="text-slate-600 text-xs leading-relaxed max-w-[240px]">
                            Challenge friends to a 3-in-a-row classic showdown! Instant moves and live socket sync.
                          </p>
                        </div>
                        <button
                          onClick={() => setActiveTab("friends")}
                          className="w-11 h-11 rounded-2xl bg-white/70 hover:bg-white text-orange-600 flex items-center justify-center active-scale transition-all border border-white shadow-md hover:shadow-lg shrink-0"
                        >
                          <span className="material-symbols-outlined text-[20px] font-bold">grid_3x3</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Indicator Dots */}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                    <button 
                      onClick={() => setCurrentSlide(0)}
                      className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${currentSlide === 0 ? "bg-slate-800 w-3" : "bg-slate-800/40"}`}
                    ></button>
                    <button 
                      onClick={() => setCurrentSlide(1)}
                      className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${currentSlide === 1 ? "bg-slate-800 w-3" : "bg-slate-800/40"}`}
                    ></button>
                  </div>
                </section>

                {/* Recent Activity / News Section */}
                <section className="pb-10">
                  <h3 className="font-display text-sm font-extrabold text-on-surface uppercase tracking-wider mb-3">Latest News</h3>
                  <div className="bg-white/20 backdrop-blur-md rounded-3xl border border-white/50 overflow-hidden card-shadow">
                    <div className="h-36 w-full relative">
                      <img 
                        className="w-full h-full object-cover" 
                        alt="Cyber Clash Season 4 Tournament Banner"
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuAjsrQtfFXT6d_kuEojF0vaPVdCLoKPJoKFGy6W2fp3pYD1B62Za0fvl4EFC8p2AZHh9KBOooer8cdeFj435C8cW7SG2LX9WPWl55cgl63Mt7T37pC5xdL4Mow365P_dLqxdFPsDPQXtwhyyFtogGuD_P4y_-VqmnypECrB_wIpE4hySAtAIsMZ7YndfGQU6UBQvOM87J4p-1xx5W-NO1VAAn4L-zNfU0uDwmTxFBCOyzHtLlioFMhEaNtxE-TxVDjM4_YOs0eS4sE"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                        <span className="bg-primary text-white text-[8px] font-black px-2 py-0.5 rounded-full mb-1 inline-block uppercase tracking-wider">Event</span>
                        <h4 className="text-white font-extrabold text-sm">Cyber Clash Season 4 Starts Today!</h4>
                      </div>
                    </div>
                    <div className="p-4 flex items-center justify-between">
                      <p className="text-slate-655 text-xs max-w-[200px] font-medium leading-relaxed">Join the tournament and win exclusive legendary skins.</p>
                      <button 
                        onClick={() => setActiveTab("friends")}
                        className="w-8 h-8 rounded-full bg-primary/10 hover:bg-primary text-primary hover:text-white flex items-center justify-center active-scale border border-primary/20 transition cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* TAB 2: FRIENDS */}
            {activeTab === "friends" && (
              <div className="space-y-6">
                {/* Search Bar */}
                <section className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-4 text-outline">search</span>
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search for friends or email..."
                    className="w-full h-12 pl-11 pr-4 bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-sm focus:ring-2 focus:ring-primary/20 text-sm text-on-surface"
                  />
                </section>

                {/* Add Friend Panel */}
                <section className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/30 card-shadow space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
                      <span className="material-symbols-outlined">person_add</span>
                    </div>
                    <h2 className="font-display font-extrabold text-base text-on-surface">Add Friend</h2>
                  </div>

                  {friendError && (
                    <div className="p-3 text-xs text-error bg-error-container/30 border border-error/20 rounded-xl font-bold flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px]">warning</span>
                      {friendError}
                    </div>
                  )}

                  {friendSuccess && (
                    <div className="p-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl font-bold flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px]">check_circle</span>
                      {friendSuccess}
                    </div>
                  )}

                  <form onSubmit={handleAddFriend} className="flex gap-2">
                    <input 
                      type="email" 
                      required 
                      value={friendEmail}
                      onChange={(e) => setFriendEmail(e.target.value)}
                      placeholder="Enter friend's email..."
                      className="flex-1 px-4 py-2 border border-outline-variant/40 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-on-surface"
                    />
                    <button 
                      type="submit" 
                      disabled={addingFriend}
                      className="px-5 bg-primary hover:bg-primary-container text-white font-bold text-sm rounded-xl transition cursor-pointer flex items-center justify-center shadow-md active-scale"
                    >
                      {addingFriend ? (
                        <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
                      ) : (
                        "Invite"
                      )}
                    </button>
                  </form>
                </section>

                {/* Friend Requests Section */}
                {(friends.pendingReceived.length > 0 || friends.pendingSent.length > 0) && (
                  <section className="space-y-3">
                    <h2 className="font-display text-sm font-extrabold text-on-surface uppercase tracking-wider flex items-center gap-1.5">
                      Friend Requests
                      {friends.pendingReceived.length > 0 && (
                        <span className="bg-primary text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                          {friends.pendingReceived.length}
                        </span>
                      )}
                    </h2>

                    {/* Received */}
                    {friends.pendingReceived.map((req) => (
                      <div key={req.friendshipId} className="flex items-center justify-between p-3.5 glossy-surface rounded-2xl card-shadow">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="w-12 h-12 rounded-full bg-primary-fixed flex items-center justify-center text-primary font-display font-extrabold text-sm uppercase">
                            {req.sender.name ? req.sender.name[0] : req.sender.email[0]}
                          </div>
                          <div className="overflow-hidden">
                            <span className="font-bold text-sm text-on-surface truncate block">{req.sender.name || req.sender.email}</span>
                            <span className="text-[10px] text-outline">Level 12 • Wants to connect</span>
                          </div>
                        </div>
                        <div className="flex gap-1.5">
                          <button 
                            disabled={actionLoadingId === req.friendshipId}
                            onClick={() => handleFriendResponse(req.friendshipId, "ACCEPT")}
                            className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center font-bold active-scale shadow-sm cursor-pointer disabled:opacity-50"
                          >
                            {actionLoadingId === req.friendshipId ? (
                              <span className="btn-loader" />
                            ) : (
                              <span className="material-symbols-outlined text-[20px]">check</span>
                            )}
                          </button>
                          <button 
                            disabled={actionLoadingId === req.friendshipId}
                            onClick={() => handleFriendResponse(req.friendshipId, "DECLINE")}
                            className="w-10 h-10 rounded-xl bg-surface-container text-on-surface-variant border border-outline-variant/30 flex items-center justify-center font-bold active-scale cursor-pointer disabled:opacity-50"
                          >
                            <span className="material-symbols-outlined text-[20px]">close</span>
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Sent pending */}
                    {friends.pendingSent.map((req) => (
                      <div key={req.friendshipId} className="flex items-center justify-between p-3 bg-surface-container-low/50 border border-outline-variant/30 border-dashed rounded-xl opacity-80">
                        <span className="font-bold text-xs text-on-surface-variant truncate mr-2">
                          {req.receiver.name || req.receiver.email}
                        </span>
                        <span className="text-[10px] text-tertiary bg-tertiary-container/30 px-2 py-0.5 rounded-full font-bold">
                          Pending
                        </span>
                      </div>
                    ))}
                  </section>
                )}

                {/* My Friends List */}
                <section className="space-y-3">
                  <h2 className="font-display text-sm font-extrabold text-on-surface uppercase tracking-wider">
                    My Friends ({filteredFriends.length})
                  </h2>

                  {filteredFriends.length === 0 ? (
                    <div className="text-center py-10 bg-surface-container-lowest/50 border border-outline-variant/20 border-dashed rounded-2xl text-outline font-bold text-sm">
                      {searchQuery ? "No matches found." : "Squad list empty. Invite a friend above!"}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredFriends.map(({ friendshipId, friend }) => {
                        const isOnline = statuses[friend.id] !== undefined ? statuses[friend.id] === "online" : friend.isOnline;
                        return (
                          <div key={friendshipId} className="flex items-center justify-between py-2 border-b border-outline-variant/20 hover:border-primary/20 transition-all active-scale group cursor-pointer">
                            <div className="flex items-center gap-3 overflow-hidden mr-2">
                              <div className="relative">
                                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-surface-container flex items-center justify-center bg-gradient-to-tr from-primary to-secondary text-white font-display font-extrabold text-sm uppercase">
                                  {friend.name ? friend.name[0] : friend.email[0]}
                                </div>
                                <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 border-2 border-white rounded-full ${
                                  isOnline ? "bg-[#4CAF50]" : "bg-outline"
                                }`}></span>
                              </div>
                              <div className="overflow-hidden">
                                <p className="font-bold text-sm text-on-surface group-hover:text-primary transition-colors truncate">
                                  {friend.name || friend.email}
                                </p>
                                <p className={`text-[10px] font-bold ${isOnline ? "text-[#4CAF50]" : "text-outline"}`}>
                                  {isOnline ? "Online" : "Offline"}
                                </p>
                              </div>
                            </div>

                            {isOnline ? (
                              <button 
                                disabled={actionLoadingId === friend.id}
                                onClick={() => setInviteTargetId(friend.id)}
                                className="glossy-secondary px-4 py-2 rounded-xl text-white font-bold text-xs active-scale cursor-pointer shadow-sm hover:shadow-md disabled:opacity-50 min-w-[72px] flex items-center justify-center"
                              >
                                {actionLoadingId === friend.id ? <span className="btn-loader" /> : "Invite"}
                              </button>
                            ) : (
                              <button 
                                disabled={actionLoadingId === friend.id}
                                onClick={() => setInviteTargetId(friend.id)}
                                className="bg-surface-container hover:bg-surface-container-high px-4 py-2 rounded-xl text-primary font-bold text-xs border border-outline-variant/30 active-scale cursor-pointer shadow-sm hover:shadow-md disabled:opacity-50 min-w-[72px] flex items-center justify-center"
                              >
                                {actionLoadingId === friend.id ? <span className="btn-loader" /> : "Invite"}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* suggestions */}
                <section className="pt-2">
                  <div className="bg-primary/5 rounded-2xl p-4 flex items-center justify-between border border-primary/10 active-scale cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <span className="material-symbols-outlined">person_add</span>
                      </div>
                      <div>
                        <p className="font-bold text-xs text-on-surface">Find more friends</p>
                        <p className="text-[10px] text-on-surface-variant font-semibold mt-0.5">Connect your contacts or social media</p>
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-primary">chevron_right</span>
                  </div>
                </section>
              </div>
            )}

            {/* TAB 3: BATTLE HISTORY */}
            {activeTab === "history" && (
              <div className="space-y-4">
                <h2 className="font-display text-sm font-extrabold text-on-surface uppercase tracking-wider mb-2">
                  Battle Log ({games.pastGames.length})
                </h2>

                {games.pastGames.length === 0 ? (
                  <div className="text-center py-12 bg-surface-container-lowest border border-outline-variant/30 rounded-2xl text-outline font-bold text-sm">
                    No matches played yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {games.pastGames.map((game) => {
                      const isWinner = game.winnerId === user.id;
                      const isP1 = game.player1Id === user.id;
                      const opponent = isP1 ? game.player2 : game.player1;
                      const turnsPlayed = isP1 
                        ? (game.player1Guesses || []).length
                        : (game.player2Guesses || []).length;
                      
                      return (
                        <div 
                          key={game.id}
                          className={`p-4 rounded-2xl border flex items-center justify-between card-shadow glossy-shine bg-white ${
                            isWinner ? "border-emerald-200" : "border-error-container"
                          }`}
                        >
                          <div className="space-y-1">
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full inline-block ${
                              isWinner ? "bg-emerald-50 text-emerald-700" : "bg-error-container/30 text-error"
                            }`}>
                              {isWinner ? "Victory" : "Defeat"}
                            </span>
                            <h4 className="font-display font-extrabold text-sm text-on-surface">
                              vs. {opponent.name || opponent.email} <span className="text-[10px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full font-bold ml-1">{game.mode === "MEMORY" ? "🧩 Memory" : (game.mode === "TICTACTOE" ? "❌⭕ Tic Tac Toe" : (game.mode === "WORD_GUESS" ? "📝 Word Guess" : (game.mode === "DOTS" ? "🎮 Dots & Boxes" : "🎯 Battle")))}</span>
                            </h4>
                            <p className="text-[10px] text-outline font-semibold">
                              Played on {new Date(game.updatedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-display font-extrabold text-base text-primary">{turnsPlayed} turns</p>
                            <p className="text-[10px] text-outline uppercase font-bold mt-0.5">game duration</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: PROFILE */}
            {activeTab === "profile" && (
              <div className="space-y-6">
                {/* Profile Card details */}
                <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 card-shadow space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-primary text-white flex items-center justify-center font-display font-extrabold text-2xl uppercase shadow-md animate-bob">
                      {user.name ? user.name[0] : user.email[0]}
                    </div>
                    <div>
                      <h3 className="font-display font-extrabold text-lg text-on-surface leading-tight">
                        {user.name || user.email.split("@")[0]}
                      </h3>
                      <p className="text-xs text-outline">{user.email}</p>
                      <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider mt-1.5 inline-block">
                        {user.role}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-outline-variant/20 pt-4 space-y-2.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-on-surface-variant font-bold">Games Completed</span>
                      <span className="text-on-surface font-extrabold">{games.pastGames.length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-on-surface-variant font-bold">Win Streak / Level</span>
                      <span className="text-on-surface font-extrabold">Level {currentLevel}</span>
                    </div>
                  </div>
                </div>

                {/* Active Ongoing Games */}
                {games.activeGames.length > 0 && (
                  <section className="space-y-3">
                    <h3 className="font-display text-sm font-extrabold text-on-surface uppercase tracking-wider">
                      Active Matches ({games.activeGames.length})
                    </h3>
                    <div className="space-y-2">
                      {games.activeGames.map((game) => {
                        const isP1 = game.player1Id === user.id;
                        const opponent = isP1 ? game.player2 : game.player1;
                        const isTurn = game.status === "PLAYING" && game.turn === user.id;
                        const isOpponentWaiting = waitingMatchesMap[game.id] && waitingMatchesMap[game.id].includes(opponent.id);
                        return (
                          <div 
                            key={game.id}
                            className={`p-3.5 glossy-surface rounded-xl flex items-center justify-between border transition card-shadow ${
                              isOpponentWaiting ? "border-emerald-500/40 bg-emerald-500/5 animate-pulse-slow" : "border-outline-variant/30 hover:border-primary/30"
                            }`}
                          >
                            <div>
                              <p className="font-bold text-sm text-on-surface flex items-center gap-1.5 flex-wrap">
                                <span>vs {opponent.name || opponent.email}</span>
                                <span className="text-[9px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full font-bold">
                                  {game.mode === "MEMORY" ? "🧩 Memory" : (game.mode === "TICTACTOE" ? "❌⭕ Tic Tac Toe" : (game.mode === "WORD_GUESS" ? "📝 Word Guess" : (game.mode === "DOTS" ? "🎮 Dots & Boxes" : "🎯 Battle")))}
                                </span>
                                {isOpponentWaiting && (
                                  <span className="text-[8px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-full font-black animate-pulse">WAITING</span>
                                )}
                              </p>
                              <p className="text-[10px] font-bold text-primary mt-0.5 uppercase tracking-wider flex items-center gap-1">
                                {isOpponentWaiting && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>}
                                {isTurn ? "👉 Your Turn" : "⏳ Opponent's Turn"}
                              </p>
                            </div>
                            <button
                              onClick={() => router.push(`/game/${game.id}`)}
                              className="px-4 py-2 glossy-primary text-white font-bold text-xs rounded-xl active-scale cursor-pointer"
                            >
                              Resume
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* Session Actions */}
                <div className="flex flex-col gap-2 pt-2">
                  {user.role === "ADMIN" && (
                    <button 
                      onClick={() => router.push("/admin")}
                      className="w-full h-12 rounded-xl bg-surface-container text-amber-700 font-extrabold text-sm border-b-4 border-amber-800 flex items-center justify-center gap-2 cursor-pointer active-scale"
                    >
                      <span className="material-symbols-outlined text-[18px]">security</span>
                      Admin Dashboard
                    </button>
                  )}

                  <button 
                    onClick={handleLogout}
                    className="w-full h-12 rounded-xl bg-error text-white font-extrabold text-sm border-b-4 border-red-950 flex items-center justify-center gap-2 cursor-pointer active-scale shadow-md"
                  >
                    <span className="material-symbols-outlined text-[18px]">logout</span>
                    Logout Account
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* BottomNavBar */}
      <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[92%] max-w-lg z-40 flex justify-around items-center px-2 bg-white/40 backdrop-blur-xl border border-white/50 shadow-2xl rounded-3xl h-14">
        {/* Home */}
        <button 
          onClick={() => setActiveTab("home")}
          className={`flex flex-col items-center justify-center flex-1 h-full relative cursor-pointer transition-all duration-150 active-scale ${
            activeTab === "home" ? "text-primary font-extrabold" : "text-on-surface-variant hover:text-primary-container"
          }`}
        >
          <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: activeTab === "home" ? "'FILL' 1" : "" }}>home</span>
          <span className="font-display text-[9px] mt-0.5">Home</span>
          {activeTab === "home" && <span className="absolute bottom-1 w-1 h-1 bg-primary rounded-full"></span>}
        </button>

        {/* Play */}
        <button 
          onClick={() => setActiveTab("friends")}
          className={`flex flex-col items-center justify-center flex-1 h-full relative cursor-pointer transition-all duration-150 active-scale ${
            activeTab === "friends" ? "text-primary font-extrabold" : "text-on-surface-variant hover:text-primary-container"
          }`}
        >
          <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: activeTab === "friends" ? "'FILL' 1" : "" }}>sports_esports</span>
          <span className="font-display text-[9px] mt-0.5">Play</span>
          {activeTab === "friends" && <span className="absolute bottom-1 w-1 h-1 bg-primary rounded-full"></span>}
        </button>

        {/* Chats */}
        <button 
          onClick={() => router.push("/chats")}
          className="flex flex-col items-center justify-center flex-1 h-full relative cursor-pointer transition-all duration-150 active-scale text-on-surface-variant hover:text-primary-container"
        >
          <span className="material-symbols-outlined text-[22px]">chat</span>
          <span className="font-display text-[9px] mt-0.5">Chats</span>
        </button>

        {/* History */}
        <button 
          onClick={() => setActiveTab("history")}
          className={`flex flex-col items-center justify-center flex-1 h-full relative cursor-pointer transition-all duration-150 active-scale ${
            activeTab === "history" ? "text-primary font-extrabold" : "text-on-surface-variant hover:text-primary-container"
          }`}
        >
          <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: activeTab === "history" ? "'FILL' 1" : "" }}>history</span>
          <span className="font-display text-[9px] mt-0.5">History</span>
          {activeTab === "history" && <span className="absolute bottom-1 w-1 h-1 bg-primary rounded-full"></span>}
        </button>

        {/* Profile */}
        <button 
          onClick={() => setActiveTab("profile")}
          className={`flex flex-col items-center justify-center flex-1 h-full relative cursor-pointer transition-all duration-150 active-scale ${
            activeTab === "profile" ? "text-primary font-extrabold" : "text-on-surface-variant hover:text-primary-container"
          }`}
        >
          <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: activeTab === "profile" ? "'FILL' 1" : "" }}>person</span>
          <span className="font-display text-[9px] mt-0.5">Profile</span>
          {activeTab === "profile" && <span className="absolute bottom-1 w-1 h-1 bg-primary rounded-full"></span>}
        </button>
      </nav>
    </div>
  );
}
