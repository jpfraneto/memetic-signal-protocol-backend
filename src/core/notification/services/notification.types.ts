export interface FarcasterNotificationResponse {
  successes?: Array<{
    notificationId: string;
  }>;
  failures?: Array<{
    notificationId: string;
    error: string;
  }>;
}
