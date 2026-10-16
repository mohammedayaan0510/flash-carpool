import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { MessageSquare, Send, X, User } from 'lucide-react';

export default function ChatDrawer({ ride, currentUser, onClose }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchMessages();

    // Subscribe to real-time incoming messages for this specific ride
    const channel = supabase
      .channel(`public:flash_carpool_messages:ride_id=eq.${ride.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'flash_carpool_messages',
          filter: `ride_id=eq.${ride.id}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ride.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchMessages = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('flash_carpool_messages')
      .select('*')
      .eq('ride_id', ride.id)
      .order('created_at', { ascending: true });

    if (!error) setMessages(data || []);
    setLoading(false);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const msgContent = newMessage;
    setNewMessage('');

    const { error } = await supabase.from('flash_carpool_messages').insert([
      {
        ride_id: ride.id,
        sender_id: currentUser.id,
        sender_name: currentUser.email.split('@')[0],
        content: msgContent,
      },
    ]);

    if (error) {
      alert('Failed to send message: ' + error.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex justify-end">
      <div className="bg-slate-900 w-full max-w-md h-full border-l border-slate-800 flex flex-col justify-between shadow-2xl">
        
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/50">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" /> Ride Chat
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {ride.pickup_location} → {ride.destination}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message Log */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3">
          {loading ? (
            <p className="text-xs text-slate-500 text-center py-4">Loading conversation...</p>
          ) : messages.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-4">No messages yet. Send a note to coordinate!</p>
          ) : (
            messages.map((msg) => {
              const isMine = msg.sender_id === currentUser.id;
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                >
                  <span className="text-[10px] text-slate-400 mb-1 px-1 flex items-center gap-1">
                    <User className="w-3 h-3" /> {msg.sender_name}
                  </span>
                  <div
                    className={`max-w-[80%] text-xs p-3 rounded-2xl ${
                      isMine
                        ? 'bg-emerald-500 text-slate-950 font-medium rounded-br-none'
                        : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Send Input */}
        <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-800 bg-slate-800/50 flex gap-2">
          <input
            type="text"
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="flex-1 bg-slate-900 text-xs p-3 rounded-xl border border-slate-700 text-white focus:outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 p-3 rounded-xl transition"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

      </div>
    </div>
  );
}