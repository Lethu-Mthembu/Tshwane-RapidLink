export interface HealthResponse {
    status: 'ok';
    service: 'rapidlink-api';
    timestamp: string;
}
export interface ErrorResponse {
    error: {
        code: string;
        message: string;
    };
}
