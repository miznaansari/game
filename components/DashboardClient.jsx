"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";
import PWAInstallBanner from "./PWAInstallBanner";

export default function DashboardClient({ user }) {
  const router = useRouter();
  const [friends, setFriends] = useState({ pendingSent: [], pendingReceived: [], accepted: [] });
  const [games, setGames] = useState({ activeGames: [], pastGames: [] });
  
  // Navigation tabs: "home", "friends", "history", "profile"
  const [activeTab, setActiveTab] = useState("home");
  const [searchQuery, setSearchQuery] = useState("");

  // Form states
  const [friendEmail, setFriendEmail] = useState("");
  const [friendError, setFriendError] = useState("");
  const [friendSuccess, setFriendSuccess] = useState("");
  const [addingFriend, setAddingFriend] = useState(false);
  
  // General states
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState({});
  const [activeInvite, setActiveInvite] = useState(null);
  const [socket, setSocket] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [inviteTargetId, setInviteTargetId] = useState(null);

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
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";
    const newSocket = io(socketUrl, {
      transports: ["websocket"]
    });
    setSocket(newSocket);

    newSocket.on("connect", () => {
      console.log("Connected to socket server");
      newSocket.emit("user-online", user.id);
    });

    newSocket.on("friend-status-changed", ({ userId, status }) => {
      setStatuses((prev) => ({ ...prev, [userId]: status }));
    });

    newSocket.on("invite-received", ({ senderId, senderName, gameId, mode }) => {
      setActiveInvite({ senderId, senderName, gameId, mode: mode || "BATTLE" });
    });

    return () => {
      newSocket.disconnect();
    };
  }, [user.id]);

  // Request online status for all accepted friends
  useEffect(() => {
    if (!socket || friends.accepted.length === 0) return;

    const ids = friends.accepted.map(f => f.friend.id);
    socket.emit("get-online-status", ids, (response) => {
      setStatuses(response);
    });
  }, [socket, friends.accepted]);

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

  const handleInviteToGame = async (receiverId, mode = "BATTLE") => {
    setActionLoadingId(receiverId);
    setInviteTargetId(null);
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiverId, mode }),
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
  const onlineFriendsCount = friends.accepted.filter(f => statuses[f.friend.id] === "online").length;
  const winsCount = games.pastGames.filter(g => g.winnerId === user.id).length;
  const lossesCount = games.pastGames.filter(g => g.winnerId && g.winnerId !== user.id).length;
  const currentLevel = 1 + games.pastGames.length;
  const xpProgress = Math.min(100, Math.floor(((games.pastGames.length % 5) / 5) * 100));

  // Filter accepted friends
  const filteredFriends = friends.accepted.filter(({ friend }) => {
    const name = (friend.name || "").toLowerCase();
    const email = (friend.email || "").toLowerCase();
    const query = searchQuery.toLowerCase();
    return name.includes(query) || email.includes(query);
  });

  return (
    <div className="min-h-screen bg-background text-on-background font-body pb-24 gaming-pattern flex flex-col">
      {actionLoadingId === "logout" && (
        <div className="glass-overlay">
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
                <span className="font-bold text-primary">{activeInvite.senderName}</span> wants to play <span className="font-extrabold text-secondary">{activeInvite.mode === "MEMORY" ? "Emoji Memory Match 🧩" : "Grid Battleship 🎯"}</span>.
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
            </div>
          </div>
        </div>
      )}

      {/* TopAppBar */}
      <header className="w-full top-0 sticky z-40 bg-surface-bright/80 backdrop-blur-xl border-b border-outline-variant/30 shadow-sm flex justify-between items-center px-5 py-2 h-14">
        <div className="flex items-center gap-3">
          <div 
            onClick={() => setActiveTab("profile")}
            className="w-10 h-10 rounded-full border-2 border-primary-container overflow-hidden active-scale cursor-pointer flex items-center justify-center bg-primary text-white font-display font-extrabold text-sm uppercase"
          >
            {user.name ? user.name[0] : (user.email ? user.email[0] : "U")}
          </div>
          <h1 className="font-display text-2xl font-extrabold text-primary">GamerHub</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-surface-container-high px-3 py-1.5 rounded-full flex items-center gap-1 active-scale cursor-pointer" onClick={() => setActiveTab("profile")}>
            <span className="material-symbols-outlined text-tertiary text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>diamond</span>
            <span className="font-display font-extrabold text-xs text-on-surface">1,250 Gems</span>
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            className="w-9 h-9 rounded-full bg-error/10 text-error flex items-center justify-center active-scale transition-transform cursor-pointer hover:bg-error/20"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
          </button>
        </div>
      </header>

      {/* Main Canvas Container */}
      <main className="flex-grow px-5 pt-5 max-w-2xl mx-auto w-full">
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
                {/* Welcome section */}
                <section className="space-y-1">
                  <p className="text-on-surface-variant font-bold text-xs uppercase tracking-wider">Welcome back,</p>
                  <h2 className="font-display text-2xl font-extrabold text-on-surface">{user.name || user.email.split("@")[0]}</h2>
                </section>

                <PWAInstallBanner />

                {/* Bento Grid layout */}
                <div className="grid grid-cols-1 gap-4">
                  {/* Play 1v1 Card (Blue/Purple Gradient) */}
                  <div className="relative overflow-hidden rounded-2xl card-shadow glossy-shine bg-gradient-to-br from-[#2e5bff] to-[#731be5] p-6 h-60 flex flex-col justify-between active-scale transition-transform">
                    <div className="absolute top-[-20px] right-[-20px] opacity-20">
                      <span className="material-symbols-outlined text-[120px] text-white">sports_esports</span>
                    </div>
                    <div>
                      <span className="bg-white/20 text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">Live Arena</span>
                      <h3 className="text-white font-display text-xl font-extrabold mt-2">Play 1v1</h3>
                      <p className="text-white/80 text-sm mt-1 max-w-[220px]">Challenge opponents and climb the ranks.</p>
                    </div>
                    <button 
                      onClick={() => setActiveTab("friends")}
                      className="w-full h-11 rounded-xl btn-3d-blue text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
                    >
                      Start Match
                      <span className="material-symbols-outlined text-[20px]">bolt</span>
                    </button>
                  </div>

                  {/* Friends Card (Green/Teal Gradient) */}
                  <div className="relative overflow-hidden rounded-2xl card-shadow glossy-shine bg-gradient-to-br from-[#00c853] to-[#00838f] p-6 h-60 flex flex-col justify-between active-scale transition-transform">
                    <div className="absolute top-[-20px] right-[-20px] opacity-20">
                      <span className="material-symbols-outlined text-[120px] text-white">group</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 bg-lime-400 rounded-full animate-pulse"></span>
                        <span className="text-white text-[10px] font-bold uppercase tracking-wider">
                          {onlineFriendsCount} Squad Online
                        </span>
                      </div>
                      <h3 className="text-white font-display text-xl font-extrabold mt-2">Friends List</h3>
                      <p className="text-white/80 text-sm mt-1 max-w-[220px]">See who is online and start real-time battle.</p>
                    </div>
                    <button 
                      onClick={() => setActiveTab("friends")}
                      className="w-full h-11 rounded-xl btn-3d-green text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
                    >
                      View Squad
                      <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                    </button>
                  </div>

                  {/* Split Row for Match History and Progress */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Match History Card (Orange/Red) */}
                    <div className="relative overflow-hidden rounded-2xl card-shadow glossy-shine bg-gradient-to-br from-[#ff6d00] to-[#d50000] p-5 h-44 flex flex-col justify-between active-scale transition-transform">
                      <div className="absolute top-[-10px] right-[-10px] opacity-20">
                        <span className="material-symbols-outlined text-[80px] text-white">history</span>
                      </div>
                      <div>
                        <h3 className="text-white font-display text-base font-extrabold">Battle History</h3>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <span className="bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded border border-white/20">
                            {winsCount} Wins
                          </span>
                          <span className="bg-white/10 text-white/70 text-[10px] font-bold px-2 py-0.5 rounded">
                            {lossesCount} Losses
                          </span>
                        </div>
                      </div>
                      <button 
                        onClick={() => setActiveTab("history")}
                        className="w-full h-9 rounded-xl btn-3d-orange text-white font-bold text-xs flex items-center justify-center cursor-pointer"
                      >
                        Stats
                      </button>
                    </div>

                    {/* Profile Card (Modern Glass Container) */}
                    <div className="relative overflow-hidden rounded-2xl card-shadow glossy-surface p-5 h-44 flex flex-col justify-between active-scale transition-transform">
                      <div className="absolute top-[-10px] right-[-10px] opacity-10">
                        <span className="material-symbols-outlined text-[80px] text-primary">person</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-lg bg-primary-fixed flex items-center justify-center shadow-inner text-primary-container font-display font-extrabold">
                          🏆
                        </div>
                        <div>
                          <h3 className="text-on-surface font-display text-sm font-extrabold leading-none">Level {currentLevel}</h3>
                          <p className="text-on-surface-variant text-[10px] font-semibold mt-1">Master Guardian II</p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] font-bold text-on-surface-variant uppercase">
                          <span>XP Progress</span>
                          <span>{xpProgress}%</span>
                        </div>
                        <div className="w-full h-2.5 bg-surface-container rounded-full overflow-hidden border border-outline-variant/30">
                          <div className="h-full bg-gradient-to-r from-primary to-secondary relative" style={{ width: `${xpProgress}%` }}>
                            <div className="absolute inset-0 bg-white/20" style={{ clipPath: "polygon(0 0, 100% 0, 80% 100%, 0% 100%)" }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent Activity / News Section */}
                <section className="pb-10">
                  <h3 className="font-display text-lg font-extrabold text-on-surface mb-3">Latest News</h3>
                  <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden card-shadow">
                    <div className="h-36 w-full relative">
                      <img 
                        className="w-full h-full object-cover" 
                        alt="Cyber Clash Season 4 Tournament Banner"
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuAjsrQtfFXT6d_kuEojF0vaPVdCLoKPJoKFGy6W2fp3pYD1B62Za0fvl4EFC8p2AZHh9KBOooer8cdeFj435C8cW7SG2LX9WPWl55cgl63Mt7T37pC5xdL4Mow365P_dLqxdFPsDPQXtwhyyFtogGuD_P4y_-VqmnypECrB_wIpE4hySAtAIsMZ7YndfGQU6UBQvOM87J4p-1xx5W-NO1VAAn4L-zNfU0uDwmTxFBCOyzHtLlioFMhEaNtxE-TxVDjM4_YOs0eS4sE"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                        <span className="bg-primary text-white text-[9px] font-bold px-2 py-0.5 rounded mb-1 inline-block">EVENT</span>
                        <h4 className="text-white font-extrabold text-sm">Cyber Clash Season 4 Starts Today!</h4>
                      </div>
                    </div>
                    <div className="p-4 flex items-center justify-between">
                      <p className="text-on-surface-variant text-xs max-w-[200px]">Join the tournament and win exclusive legendary skins.</p>
                      <button 
                        onClick={() => setActiveTab("friends")}
                        className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center active-scale transition-transform cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
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
                        const isOnline = statuses[friend.id] === "online";
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
                              vs. {opponent.name || opponent.email} <span className="text-[10px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full font-bold ml-1">{game.mode === "MEMORY" ? "🧩 Memory" : "🎯 Battle"}</span>
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
                    <div className="w-16 h-16 rounded-2xl bg-primary text-white flex items-center justify-center font-display font-extrabold text-2xl uppercase shadow-md">
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
                        return (
                          <div 
                            key={game.id}
                            className="p-3.5 glossy-surface rounded-xl flex items-center justify-between border border-outline-variant/30 hover:border-primary/30 transition card-shadow"
                          >
                            <div>
                              <p className="font-bold text-sm text-on-surface flex items-center gap-1.5 flex-wrap">
                                <span>vs {opponent.name || opponent.email}</span>
                                <span className="text-[9px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full font-bold">{game.mode === "MEMORY" ? "🧩 Memory" : "🎯 Battle"}</span>
                              </p>
                              <p className="text-[10px] font-bold text-primary mt-0.5 uppercase tracking-wider">
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
      <nav className="fixed bottom-0 left-0 w-full z-40 flex justify-around items-center px-container-margin pb-safe bg-surface-container-lowest/90 backdrop-blur-2xl border-t border-outline-variant/20 shadow-[0px_-4px_12px_rgba(0,0,0,0.05)] h-16">
        {/* Home */}
        <button 
          onClick={() => setActiveTab("home")}
          className={`flex flex-col items-center justify-center flex-1 h-full relative cursor-pointer transition-all duration-150 active-scale ${
            activeTab === "home" ? "text-primary font-extrabold" : "text-on-surface-variant hover:text-primary-container"
          }`}
        >
          <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: activeTab === "home" ? "'FILL' 1" : "" }}>home</span>
          <span className="font-display text-[10px] mt-0.5">Home</span>
          {activeTab === "home" && <span className="absolute bottom-1 w-1.5 h-1.5 bg-primary rounded-full"></span>}
        </button>

        {/* Play */}
        <button 
          onClick={() => setActiveTab("friends")}
          className={`flex flex-col items-center justify-center flex-1 h-full relative cursor-pointer transition-all duration-150 active-scale ${
            activeTab === "friends" ? "text-primary font-extrabold" : "text-on-surface-variant hover:text-primary-container"
          }`}
        >
          <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: activeTab === "friends" ? "'FILL' 1" : "" }}>sports_esports</span>
          <span className="font-display text-[10px] mt-0.5">Play</span>
          {activeTab === "friends" && <span className="absolute bottom-1 w-1.5 h-1.5 bg-primary rounded-full"></span>}
        </button>

        {/* Friends */}
        <button 
          onClick={() => setActiveTab("friends")}
          className={`flex flex-col items-center justify-center flex-1 h-full relative cursor-pointer transition-all duration-150 active-scale ${
            activeTab === "friends" ? "text-primary font-extrabold" : "text-on-surface-variant hover:text-primary-container"
          }`}
        >
          <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: activeTab === "friends" ? "'FILL' 1" : "" }}>group</span>
          <span className="font-display text-[10px] mt-0.5">Friends</span>
        </button>

        {/* History */}
        <button 
          onClick={() => setActiveTab("history")}
          className={`flex flex-col items-center justify-center flex-1 h-full relative cursor-pointer transition-all duration-150 active-scale ${
            activeTab === "history" ? "text-primary font-extrabold" : "text-on-surface-variant hover:text-primary-container"
          }`}
        >
          <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: activeTab === "history" ? "'FILL' 1" : "" }}>history</span>
          <span className="font-display text-[10px] mt-0.5">History</span>
          {activeTab === "history" && <span className="absolute bottom-1 w-1.5 h-1.5 bg-primary rounded-full"></span>}
        </button>

        {/* Profile */}
        <button 
          onClick={() => setActiveTab("profile")}
          className={`flex flex-col items-center justify-center flex-1 h-full relative cursor-pointer transition-all duration-150 active-scale ${
            activeTab === "profile" ? "text-primary font-extrabold" : "text-on-surface-variant hover:text-primary-container"
          }`}
        >
          <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: activeTab === "profile" ? "'FILL' 1" : "" }}>person</span>
          <span className="font-display text-[10px] mt-0.5">Profile</span>
          {activeTab === "profile" && <span className="absolute bottom-1 w-1.5 h-1.5 bg-primary rounded-full"></span>}
        </button>
      </nav>
    </div>
  );
}
