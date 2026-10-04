export interface InvestorMetrics {
  totalUsers: number;
  activeUsers30d: number;

  totalReadings: number;
  readings30d: number;
  askAnything30d: number;

  averageReadingsPerActiveUser: number;

  plusSubscribers: number;
  plusXlSubscribers: number;

  thumbsUp: number;
  thumbsDown: number;
  positiveFeedbackRate: number;
}