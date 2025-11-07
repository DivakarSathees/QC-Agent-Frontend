import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { HttpClient } from '@angular/common/http';

export interface QCEvent {
  stage?: string;
  qc_results?: any;
  docker_results?: any;
  status?: string;
  [k: string]: any;
}

@Injectable({
  providedIn: 'root',
})
export class Qc {
  private endpoint = 'http://0.0.0.0:8080';
  constructor(private http: HttpClient) {}

  startFullRun(
    description: string,
    zipFile: File | null,
    configObj: object
  ): Observable<QCEvent> {
    const subject = new Subject<QCEvent>();

    const form = new FormData();
    form.append('description', description);
    if (zipFile) form.append('zip_file', zipFile, zipFile.name);
    form.append('config', JSON.stringify(configObj));

    // Use fetch so we can consume the ReadableStream progressively.
    fetch(`${this.endpoint}/qc/full-run`, {
      method: 'POST',
      body: form,
      // credentials: 'include', // if needed
      // mode: 'cors', // if needed
    })
      .then((response) => {
        if (!response.ok) {
          // Try to read body as text if error
          return response.text().then((t) => {
            subject.error(new Error(`HTTP ${response.status}: ${t}`));
            subject.complete();
            return null;
          });
        }

        if (!response.body) {
          subject.error(new Error('ReadableStream not supported by this browser / response.'));
          subject.complete();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        function pushParsedEvents() {
          // SSE uses double newline to separate events
          let parts = buffer.split('\n\n');
          // Keep last partial chunk in buffer
          buffer = parts.pop() || '';

          for (const p of parts) {
            // Each event can contain many lines; we only care about "data: ..." lines
            const lines = p.split(/\r?\n/);
            let dataLines: string[] = [];
            for (const ln of lines) {
              if (ln.startsWith('data:')) {
                // remove leading "data:" and optional space
                dataLines.push(ln.replace(/^data:\s?/, ''));
              }
              // ignore other SSE fields like "id:", "event:"
            }
            if (dataLines.length === 0) continue;
            const dataStr = dataLines.join('\n');
            try {
              const obj = JSON.parse(dataStr);
              subject.next(obj);
            } catch (err) {
              // Non-JSON data => emit as raw
              subject.next({ raw: dataStr });
            }
          }
        }

        // read loop
        function readChunk() {
          reader.read().then(({ done, value }) => {
            if (done) {
              // process any remaining buffer
              if (buffer.trim()) {
                // attempt to parse leftover
                try {
                  const obj = JSON.parse(buffer);
                  subject.next(obj);
                } catch {
                  subject.next({ raw: buffer });
                }
              }
              subject.complete();
              return;
            }

            buffer += decoder.decode(value, { stream: true });
            // try parse events
            pushParsedEvents();
            // continue reading
            readChunk();
          }).catch((err) => {
            subject.error(err);
            subject.complete();
          });
        }

        // kick off reading
        readChunk();
        return null;
      })
      .catch((err) => {
        subject.error(err);
        subject.complete();
      });

    // return as observable
    return subject.asObservable();
  }

  getQuestionBanks(data: any) {
    console.log('Fetching question banks with data:', data);
    
    return this.http.post(`${this.endpoint}/fetch-qbs`, data);
  }
  
}
