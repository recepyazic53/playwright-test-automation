// Playwright'ın globalTeardown adımı: tüm testler bittikten sonra çalışır ve
// allure-results/environment.properties dosyasını yazar. Bu sayede Allure
// raporunun "Environment" widget'ı boş kalmaz; hangi ortamda (TEST/CANLI),
// hangi taban URL ile, ne zaman koşulduğunu gösterir.
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getEnvironment, getEnvironmentName } from './environments';

export default async function globalTeardown(): Promise<void> {
  const ortam = getEnvironmentName();
  const environment = getEnvironment(ortam);

  const satirlar = [
    `Ortam=${ortam.toUpperCase()}`,
    `Taban.URL=${environment.baseURL ?? ''}`,
    `Tarayici=Chromium`,
    `Calistirma.Tarihi=${new Date().toLocaleString('tr-TR')}`
  ];

const hedefKlasor = join(process.cwd(), `allure-results-${ortam}`);
  mkdirSync(hedefKlasor, { recursive: true });
  writeFileSync(join(hedefKlasor, 'environment.properties'), satirlar.join('\n'), 'utf-8');
}
