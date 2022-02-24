export interface IAnswers {
  message: string;
  expiration: string;
}

export interface INotificationJson {
  notifications: IAnswers[];
}
