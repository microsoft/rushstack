export interface IAnswers {
  message: string;
  duration: number;
}

export interface IAnnouncement {
  message: string;
  expiration: string;
}

export interface INotificationJson {
  notifications: IAnnouncement[];
}
