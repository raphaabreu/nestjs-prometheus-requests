import promClient from 'prom-client';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { catchError, Observable, tap, throwError } from 'rxjs';

@Injectable()
export class PrometheusInterceptor implements NestInterceptor {
  private readonly histogram = new promClient.Histogram({
    name: 'nestjs_requests',
    help: 'NestJs requests - duration in seconds',
    labelNames: ['handler', 'controller'],
    buckets: [0.0001, 0.001, 0.005, 0.01, 0.025, 0.05, 0.075, 0.09, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  });
  private readonly failureCounter = new promClient.Counter({
    name: 'nestjs_requests_failed_count',
    help: 'NestJs requests that failed',
    labelNames: ['handler', 'controller', 'error'],
  });

  static registerServiceInfo(serviceInfo: { domain: string; name: string; version: string }): PrometheusInterceptor {
    new promClient.Gauge({
      name: 'nestjs_info',
      help: 'NestJs service version info',
      labelNames: ['domain', 'name', 'version'],
    }).set(
      {
        domain: serviceInfo.domain,
        name: `${serviceInfo.domain}.${serviceInfo.name}`,
        version: serviceInfo.version,
      },
      1,
    );

    return new PrometheusInterceptor();
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const labels = {
      controller: context.getClass().name,
      handler: context.getHandler().name,
    };

    const stopTimer = this.histogram.startTimer(labels);

    return next.handle().pipe(
      tap(() => stopTimer()),
      catchError((err) => {
        stopTimer();
        this.failureCounter.inc({ ...labels, error: err.constructor?.name || err });
        return throwError(err);
      }),
    );
  }
}
