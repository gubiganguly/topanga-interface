import { TrendingUp } from "lucide-react";

export default function StocksView() {
  return (
    <div className="stocks-view-container">
      <div className="placeholder-content">
        <div className="icon-circle">
          <TrendingUp size={48} color="#10b981" />
        </div>
        <h2>Market Overview</h2>
        <p>Real-time market data coming soon.</p>
        
        <div className="mock-chart">
          <div className="chart-line"></div>
        </div>
      </div>

      <style jsx>{`
        .stocks-view-container {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }
        .placeholder-content {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          max-width: 400px;
        }
        .icon-circle {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: rgba(16, 185, 129, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 8px;
        }
        h2 {
          margin: 0;
          font-size: 24px;
          font-weight: 600;
        }
        p {
          margin: 0;
          color: rgba(255, 255, 255, 0.5);
        }
        .mock-chart {
          width: 100%;
          height: 120px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          margin-top: 24px;
          position: relative;
          overflow: hidden;
        }
        .chart-line {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 60%;
          background: linear-gradient(90deg, transparent, rgba(16, 185, 129, 0.2));
          clip-path: polygon(0 100%, 0 40%, 20% 60%, 40% 30%, 60% 50%, 80% 20%, 100% 40%, 100% 100%);
        }
      `}</style>
    </div>
  );
}

