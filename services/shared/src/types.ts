export interface ProofOfTask {
  cid: string;
  merkleRoot: string;
  chunkCount: number;
  fileSize: number;
  timestamp: number;
  ipfsPeerId: string;
}

export interface TaskData {
  cid: string;
  paymentAmount: string;
  storageDuration: number;
}

export enum TaskDefinition {
  InitialPin = 1,
  PeriodicCheck = 2,
  ChallengeResolution = 3,
}

export interface TaskExecutionRequest {
  taskDefinitionId: TaskDefinition;
  data: TaskData;
}

export interface TaskValidationRequest {
  proofOfTask: string; // JSON stringified ProofOfTask
  taskDefinitionId: TaskDefinition;
  data: TaskData;
}

export interface TaskExecutionResponse {
  success: boolean;
  proofOfTask?: string;
  error?: string;
}

export interface TaskValidationResponse {
  valid: boolean;
  error?: string;
}
