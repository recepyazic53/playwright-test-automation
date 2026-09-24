// TERMİNAL KOŞULARINDA KASA ANAHTARI — global-setup.ts çağırır (ana süreçte, spec'ler
// yüklenmeden ve worker'lar başlamadan ÖNCE).
// - Test verisi YALNIZCA platform veritabanındadır (şifreli); veritabanı hazır değilse açık hata
//   verilir. Koşu sonuçları ve ekran görüntüsü/video/izler de veritabanına ŞİFRELİ yazılır
//   (scripts/platform/raporlayici.mjs).
// - PLATFORM_KASA_ANAHTARI zaten verilmişse (Nöbetçi koşuları) dokunulmaz.
// - Aksi halde kasa parolası: PLATFORM_KASA_PAROLASI ortam değişkeninden (CI) ya da terminalde
//   GİZLİ girişle (yazılanlar ekranda görünmez) sorulur; anahtar ayrı bir süreçte türetilip
//   doğrulanır ve YALNIZCA bu koşunun süreç belleğine (process.env → worker'lar) konur. Parola
//   ve anahtar hiçbir yere yazılmaz/loglanmaz; parola değişkeni ortamdan silinir.
// - TTY yoksa ve parola verilmemişse açık bir hata verilir.
import {
  KASA_ANAHTARI_DEGISKENI, KASA_PAROLASI_DEGISKENI, platformHazirOlmali, platformOkuyucusunuCalistir, platformOnbelleginiSifirla
} from './platform-veri';

const EN_FAZLA_DENEME = 3;

/** Terminalden gizli (yankısız) satır okur. Ctrl+C iptal eder. Windows ve macOS'ta çalışır. */
export function gizliSatirOku(soru: string): Promise<string> {
  const girdi = process.stdin;
  const cikti = process.stderr;
  return new Promise((coz, reddet) => {
    cikti.write(soru);
    const oncekiHam = girdi.isRaw;
    girdi.setRawMode(true);
    girdi.setEncoding('utf8');
    girdi.resume();
    let deger = '';
    const bitir = (hata?: Error): void => {
      girdi.removeListener('data', dinle);
      girdi.setRawMode(oncekiHam);
      girdi.pause();
      cikti.write('\n');
      if (hata) reddet(hata);
      else coz(deger);
    };
    const dinle = (parca: string): void => {
      for (const karakter of parca) {
        if (karakter === '\r' || karakter === '\n') return bitir();
        if (karakter === '\u0003') return bitir(new Error('Kasa parolası girişi iptal edildi (Ctrl+C).'));
        if (karakter === '\u007f' || karakter === '\b') {
          deger = [...deger].slice(0, -1).join('');
          continue;
        }
        if (karakter >= ' ') deger += karakter;
      }
    };
    girdi.on('data', dinle);
  });
}

function anahtarTuret(parola: string): { anahtar?: string; hata?: string; kod?: string } {
  // Parola yalnızca alt sürecin ortamına verilir; bu sürecin process.env'ine yazılmaz.
  return platformOkuyucusunuCalistir(['anahtar'], { [KASA_PAROLASI_DEGISKENI]: parola }) as { anahtar?: string; hata?: string; kod?: string };
}

export async function kasaAnahtariniHazirla(): Promise<void> {
  if (process.env[KASA_ANAHTARI_DEGISKENI]) return;
  platformHazirOlmali();

  const ortamParolasi = process.env[KASA_PAROLASI_DEGISKENI];
  if (ortamParolasi) {
    delete process.env[KASA_PAROLASI_DEGISKENI];
    const sonuc = anahtarTuret(ortamParolasi);
    if (!sonuc.anahtar) throw new Error(`${KASA_PAROLASI_DEGISKENI} ile kasa açılamadı: ${sonuc.hata ?? 'bilinmeyen hata'}`);
    process.env[KASA_ANAHTARI_DEGISKENI] = sonuc.anahtar;
    platformOnbelleginiSifirla();
    console.log('[global-setup] Platform kasası açıldı (PLATFORM_KASA_PAROLASI); test verisi platform veritabanından okunacak.');
    return;
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      'Proje verisi platform veritabanında ve şifreli; bu koşu için kasa parolası gerekiyor ama terminal etkileşimli değil (TTY yok).\n' +
        `  - Önerilen: testi etkileşimli bir terminalden çalıştırın (parola gizli olarak sorulur) ya da Nöbetçi'den başlatın.\n` +
        `  - CI/otomasyon: parolayı ${KASA_PAROLASI_DEGISKENI} ortam değişkeniyle verin (gizli değişken olarak; loglara yazmayın).`
    );
  }

  for (let deneme = 1; deneme <= EN_FAZLA_DENEME; deneme++) {
    const parola = await gizliSatirOku('Platform kasa parolası (yazdıklarınız görünmez): ');
    if (!parola) {
      console.log('[global-setup] Boş parola girildi.');
      continue;
    }
    const sonuc = anahtarTuret(parola);
    if (sonuc.anahtar) {
      process.env[KASA_ANAHTARI_DEGISKENI] = sonuc.anahtar;
      platformOnbelleginiSifirla();
      console.log('[global-setup] Platform kasası açıldı; test verisi platform veritabanından okunacak.');
      return;
    }
    if (sonuc.kod !== 'PAROLA_YANLIS') throw new Error(`Platform kasası açılamadı: ${sonuc.hata ?? 'bilinmeyen hata'}`);
    console.log(`[global-setup] Parola yanlış (${deneme}/${EN_FAZLA_DENEME}).`);
  }
  throw new Error('Kasa parolası doğrulanamadı; koşu durduruldu.');
}
