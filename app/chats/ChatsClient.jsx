"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";

export default function ChatsClient({ user }) {
  const router = useRouter();
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function fetchChats() {
      try {
        const res = await fetch("/api/chats");
        if (res.ok) {
          const data = await res.json();
          setChats(data);
        }
      } catch (err) {
        console.error("Failed to load chats:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchChats();
  }, []);

  // Listen for real-time message events to dynamically update conversation preview card
  useEffect(() => {
    const handleNewMessage = (e) => {
      const message = e.detail;
      setChats((prevChats) => {
        const chatIndex = prevChats.findIndex(
          (c) => c.friend.id === message.senderId || c.friend.id === message.receiverId
        );
        if (chatIndex > -1) {
          const updatedChats = [...prevChats];
          updatedChats[chatIndex] = {
            ...updatedChats[chatIndex],
            lastMessage: message
          };
          return updatedChats.sort((a, b) => {
            const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
            const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
            return timeB - timeA;
          });
        }
        return prevChats;
      });
    };

    window.addEventListener("global-direct-message-received", handleNewMessage);
    return () => {
      window.removeEventListener("global-direct-message-received", handleNewMessage);
    };
  }, []);

  // Listen for real-time online/offline status changes of friends
  useEffect(() => {
    if (!user?.id) return;

    let activeSocket = window.globalSocket;
    if (!activeSocket) {
      const socketUrl = (typeof window !== "undefined" && window.location.hostname === "localhost")
        ? "http://localhost:3001"
        : (process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001");
      activeSocket = io(socketUrl, {
        transports: ["websocket"]
      });
      window.globalSocket = activeSocket;

      activeSocket.on("connect", () => {
        console.log("[SOCKET] Connected at chats list");
        activeSocket.emit("user-online", user.id);
      });
    }

    const handleFriendStatusChanged = ({ userId, status }) => {
      setChats((prevChats) => {
        return prevChats.map((c) => {
          if (c.friend.id === userId) {
            return {
              ...c,
              friend: {
                ...c.friend,
                isOnline: status === "online"
              }
            };
          }
          return c;
        });
      });
    };

    activeSocket.on("friend-status-changed", handleFriendStatusChanged);

    // Request online status for all friends currently in the chat list
    if (chats.length > 0) {
      const ids = chats.map(c => c.friend.id);
      activeSocket.emit("get-online-status", ids, (response) => {
        setChats((prevChats) => {
          return prevChats.map((c) => {
            if (response[c.friend.id] !== undefined) {
              return {
                ...c,
                friend: {
                  ...c.friend,
                  isOnline: response[c.friend.id] === "online"
                }
              };
            }
            return c;
          });
        });
      });
    }

    return () => {
      activeSocket.off("friend-status-changed", handleFriendStatusChanged);
    };
  }, [user?.id, chats.length]);
  const getInitials = (name, email) => {
    if (name) {
      return name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);
    }
    return email.substring(0, 2).toUpperCase();
  };

  const getAvatarGradient = (id) => {
    const gradients = [
      "from-pink-500 to-rose-500",
      "from-purple-500 to-indigo-500",
      "from-blue-500 to-cyan-500",
      "from-teal-500 to-emerald-500",
      "from-amber-500 to-orange-500",
    ];
    const index = id.charCodeAt(0) % gradients.length;
    return gradients[index];
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    
    // Check if today
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // Check if yesterday
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    }
    
    // Default format
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const filteredChats = chats.filter(item => {
    const friendName = (item.friend.name || item.friend.email).toLowerCase();
    return friendName.includes(searchQuery.toLowerCase());
  });

  return (
    <div className="h-[100dvh] flex flex-col bg-[#f1f5f9] w-full max-w-md md:max-w-lg lg:max-w-xl mx-auto relative border-x border-outline-variant/20 shadow-2xl overflow-hidden">
      {/* Glossymorphic Floating Blur Blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[10%] left-[5%] w-60 h-60 rounded-full bg-primary/10 blur-[80px] animate-pulse" style={{ animationDuration: '8s' }}></div>
        <div className="absolute top-[45%] right-[-15%] w-72 h-72 rounded-full bg-secondary/10 blur-[100px] animate-pulse" style={{ animationDuration: '10s' }}></div>
        <div className="absolute bottom-[20%] left-[-10%] w-64 h-64 rounded-full bg-pink-500/5 blur-[70px] animate-pulse" style={{ animationDuration: '6s' }}></div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/40 backdrop-blur-xl border border-white/40 rounded-2xl mx-4 mt-3 shadow-lg flex flex-col p-3.5 mb-2 relative z-30">
        <div className="flex items-center justify-between mb-3">
          <h1 className="font-display text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-primary via-secondary to-pink-500 tracking-tight">
            Chats
          </h1>
          <span className="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-primary transition-colors">
            more_vert
          </span>
        </div>

        {/* Search Input */}
        <div className="relative flex items-center">
          <span className="material-symbols-outlined absolute left-3 text-outline text-[18px]">
            search
          </span>
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white/60 hover:bg-white focus:bg-white border border-white/80 focus:border-primary rounded-xl text-xs text-on-surface placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 text-outline hover:text-on-surface cursor-pointer flex items-center"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>
      </header>

      {/* Conversations List */}
      <main className="flex-1 overflow-y-auto px-4 py-2">
        {loading ? (
          <div className="space-y-4 py-6">
            {[1, 2, 3, 4].map(n => (
              <div key={n} className="flex items-center space-x-3 animate-pulse">
                <div className="w-12 h-12 bg-surface-container rounded-full"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-surface-container rounded w-1/3"></div>
                  <div className="h-3 bg-surface-container rounded w-2/3"></div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20 px-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
              <span className="material-symbols-outlined text-[32px]">chat_bubble_outline</span>
            </div>
            <h3 className="font-display font-extrabold text-on-surface text-base mb-1">
              No conversations found
            </h3>
            <p className="text-on-surface-variant text-xs max-w-[240px]">
              {searchQuery ? "No matches for your search query." : "Go to the Play/Friends tab to add friends and start chatting!"}
            </p>
            {!searchQuery && (
              <a
                href="/play"
                className="mt-4 px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl active-scale transition-transform cursor-pointer"
              >
                Find Friends
              </a>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 pb-24 relative z-10">
            {filteredChats.map((item) => {
              const friend = item.friend;
              const hasLastMessage = !!item.lastMessage;
              const isInvite = item.lastMessage?.isGameInvite;

              return (
                <div
                  key={friend.id}
                  onClick={() => router.push(`/chats/${friend.id}`)}
                  className="flex items-center space-x-3 py-3 px-3 bg-white/40 backdrop-blur-md border border-white/50 rounded-2xl cursor-pointer hover:bg-white hover:border-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                >
                  {/* Avatar & Online status indicator */}
                  <div className="relative shrink-0">
                    <div className={`w-11 h-11 rounded-full bg-gradient-to-tr ${getAvatarGradient(friend.id)} flex items-center justify-center text-white font-extrabold text-xs shadow-sm border border-white/40`}>
                      {getInitials(friend.name, friend.email)}
                    </div>
                    {friend.isOnline && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full shadow-sm"></span>
                    )}
                  </div>

                  {/* Friend info & Last message snippet */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <h4 className="font-display font-black text-xs text-slate-800 truncate">
                        {friend.name || friend.email.split("@")[0]}
                      </h4>
                      <span className="text-[9px] text-slate-450 font-bold">
                        {hasLastMessage ? formatTime(item.lastMessage.createdAt) : ""}
                      </span>
                    </div>

                    <div className="flex items-center text-[11px] text-slate-500 truncate font-medium">
                      {isInvite ? (
                        <span className="flex items-center text-primary font-bold">
                          <span className="material-symbols-outlined text-[14px] mr-1">sports_esports</span>
                          🎮 Game Challenge
                        </span>
                      ) : item.lastMessage?.content?.startsWith("[sticker:") ? (
                        <span className="flex items-center text-secondary font-bold">
                          <span className="material-symbols-outlined text-[14px] mr-1">sentiment_satisfied</span>
                          [Sticker]
                        </span>
                      ) : item.lastMessage?.content?.startsWith("[gif:") ? (
                        <span className="flex items-center text-secondary font-bold">
                          <span className="material-symbols-outlined text-[14px] mr-1">gif</span>
                          [GIF]
                        </span>
                      ) : (
                        item.lastMessage?.content || <span className="text-slate-400 italic font-semibold">Tap to start chatting</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* BottomNavBar */}
      <nav className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[92%] max-w-lg z-40 flex justify-around items-center px-2 bg-white/40 backdrop-blur-xl border border-white/50 shadow-2xl rounded-3xl h-14">
        <a 
          href="/"
          className="flex flex-col items-center justify-center flex-1 h-full relative cursor-pointer text-on-surface-variant hover:text-primary transition-all duration-150 active-scale"
        >
          <span className="material-symbols-outlined text-[22px]">home</span>
          <span className="font-display text-[9px] mt-0.5">Home</span>
        </a>

        <a 
          href="/play"
          className="flex flex-col items-center justify-center flex-1 h-full relative cursor-pointer text-on-surface-variant hover:text-primary transition-all duration-150 active-scale"
        >
          <span className="material-symbols-outlined text-[22px]">sports_esports</span>
          <span className="font-display text-[9px] mt-0.5">Play</span>
        </a>

        <a 
          href="/chats"
          className="flex flex-col items-center justify-center flex-1 h-full relative cursor-pointer text-primary font-black transition-all duration-150 active-scale"
        >
          <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>chat</span>
          <span className="font-display text-[9px] mt-0.5">Chats</span>
          <span className="absolute bottom-1 w-1 h-1 bg-primary rounded-full"></span>
        </a>

        <a 
          href="/history"
          className="flex flex-col items-center justify-center flex-1 h-full relative cursor-pointer text-on-surface-variant hover:text-primary transition-all duration-150 active-scale"
        >
          <span className="material-symbols-outlined text-[22px]">history</span>
          <span className="font-display text-[9px] mt-0.5">History</span>
        </a>

        <a 
          href="/profile"
          className="flex flex-col items-center justify-center flex-1 h-full relative cursor-pointer text-on-surface-variant hover:text-primary transition-all duration-150 active-scale"
        >
          <span className="material-symbols-outlined text-[22px]">person</span>
          <span className="font-display text-[9px] mt-0.5">Profile</span>
        </a>
      </nav>
    </div>
  );
}
