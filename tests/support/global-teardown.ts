// Tüm testlerden SONRA: terminal koşusunda global-setup'ın açtığı geçici senaryo dosyası klasörünü (şifreli
// dosyaların bu koşu için çözüldüğü yer; bkz. scripts/platform/dosyalar/gecici-dosyalar.mjs) ezip siler.
// Nöbetçi koşularında klasörün sahibi sunucudur (süreç kapanınca kendisi siler); burada da silinmesi zararsızdır.
import { dirname } from 'node:path';
import { DOSYA_KLASORU_DEGISKENI, kosuKlasoruDogrula, kosuKlasorunuSil } from '../../scripts/platform/dosyalar/gecici-dosyalar.mjs';
import { platformVeritabaniYolu } from './platform-veri';

export default async function globalTeardown(): Promise<void> {
  const klasor = process.env[DOSYA_KLASORU_DEGISKENI];
  if (!klasor || !kosuKlasoruDogrula(klasor, platformVeritabaniYolu())) return;
  kosuKlasorunuSil(klasor, dirname(klasor));
}
