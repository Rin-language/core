/** The only source of the current time: business code never calls `new Date()`. */
export interface Clock {
  now(): Date;
}
