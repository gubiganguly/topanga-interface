import { motion } from "framer-motion";
import { MessageSquare, Mic, TrendingUp, ChevronLeft, ChevronRight, Settings } from "lucide-react";
import { useState } from "react";

export default function Sidebar({ activeView, setActiveView }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const menuItems = [
    { id: "voice", label: "Voice Bot", icon: Mic },
    { id: "chat", label: "Chatbot", icon: MessageSquare },
    { id: "stocks", label: "Stocks", icon: TrendingUp },
  ];

  return (
    <motion.div 
      className="sidebar"
      animate={{ width: isCollapsed ? 60 : 240 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <div className="sidebar-header">
        <div className="logo-container">
          <div className="logo-icon"></div>
          {!isCollapsed && <motion.span initial={{opacity: 0}} animate={{opacity: 1}} className="logo-text">Topanga</motion.span>}
        </div>
        <button onClick={() => setIsCollapsed(!isCollapsed)} className="collapse-btn">
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <div className="menu-items">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button 
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`menu-item ${isActive ? "active" : ""}`}
              title={isCollapsed ? item.label : ""}
            >
              <Icon size={20} />
              {!isCollapsed && (
                <motion.span 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                >
                  {item.label}
                </motion.span>
              )}
              {isActive && (
                <motion.div 
                  layoutId="activeIndicator"
                  className="active-indicator"
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <button className="menu-item">
          <Settings size={20} />
          {!isCollapsed && <span>Settings</span>}
        </button>
      </div>

      <style jsx>{`
        .sidebar {
          height: 100vh;
          background: rgba(15, 23, 42, 0.8);
          backdrop-filter: blur(20px);
          border-right: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          z-index: 100;
        }
        .sidebar-header {
          padding: 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 70px;
        }
        .logo-container {
          display: flex;
          align-items: center;
          gap: 10px;
          overflow: hidden;
        }
        .logo-icon {
          width: 24px;
          height: 24px;
          background: linear-gradient(135deg, #6366f1, #a855f7);
          border-radius: 8px;
          flex-shrink: 0;
        }
        .logo-text {
          font-weight: 700;
          font-size: 18px;
          color: white;
          white-space: nowrap;
        }
        .collapse-btn {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .collapse-btn:hover {
          color: white;
          background: rgba(255, 255, 255, 0.1);
        }
        .menu-items {
          flex: 1;
          padding: 20px 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .menu-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
          border-radius: 12px;
          position: relative;
          transition: all 0.2s;
          white-space: nowrap;
          overflow: hidden;
        }
        .menu-item:hover {
          color: white;
          background: rgba(255, 255, 255, 0.05);
        }
        .menu-item.active {
          color: white;
        }
        .active-indicator {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          right: 0;
          background: rgba(139, 92, 246, 0.15);
          border-radius: 12px;
          z-index: -1;
          border: 1px solid rgba(139, 92, 246, 0.3);
        }
        .sidebar-footer {
          padding: 20px 10px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
      `}</style>
    </motion.div>
  );
}

