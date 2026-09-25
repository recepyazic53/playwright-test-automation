// Şifreli senaryo dosyası yükleme (genel): dosya tarayıcıdan sunucuya HAM gövde olarak gider (XHR; ilerleme gösterilir),
// sunucu bellekte şifreleyip şifreli medya deposuna yazar — düz metin diske yazılmaz. Dosyanın içeriği arayüze hiç
// geri gelmez; yalnızca ad, boyut ve referans ("nobetci-dosya://<kimlik>/<ad>") döner.
import { TOKEN } from './ortak.js';

export const DOSYA_EN_BUYUK = 20 * 1024 * 1024;

/** "nobetci-dosya://<kimlik>/<ad>" → { id, ad } | null (sunucudaki referans.mjs ile aynı kural). */
export function dosyaReferansiCoz(deger) {
  if (typeof deger !== 'string') return null;
  const e = /^nobetci-dosya:\/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([^/\\]{1,200})$/.exec(deger);
  return e ? { id: e[1], ad: e[2] } : null;
}

/** Kabul listesi ('.xlsx' ya da '.xlsx,.xls') → küçük harfli uzantılar (boşsa null = sunucunun izin listesi). */
export function kabulListesi(kabul) {
  const l = typeof kabul === 'string' ? kabul.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^\.[a-z0-9]{1,10}$/.test(x)) : [];
  return l.length ? l : null;
}

/** Tarayıcıda ön denetim (sunucu yine denetler). Sorun yoksa null, varsa Türkçe mesaj. */
export function dosyaOnDenetimi(dosya, kabul) {
  if (!dosya) return 'Dosya seçilmedi.';
  if (!dosya.size) return 'Boş dosya yüklenemez.';
  if (dosya.size > DOSYA_EN_BUYUK) return `Dosya en fazla ${DOSYA_EN_BUYUK / 1024 / 1024} MB olabilir.`;
  const liste = kabulListesi(kabul);
  const ad = dosya.name.toLowerCase();
  if (liste && !liste.some((u) => ad.endsWith(u))) return `Yalnızca ${liste.join(', ')} uzantılı dosyalar kabul edilir.`;
  return null;
}

/**
 * Dosyayı ham gövdeyle yükler. adres: /platform/senaryo-dosyasi/yukle?… ya da /platform/ekran-dosyasi/yukle?…
 * @returns {Promise<{ id: string; ad: string; boyut: number; referans: string }>}
 */
export function dosyaYukle(adres, dosya, ilerleme = () => {}) {
  return new Promise((coz, reddet) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', adres);
    xhr.setRequestHeader('X-Test-Sunucu-Token', TOKEN);
    xhr.setRequestHeader('X-Dosya-Adi', encodeURIComponent(dosya.name));
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (o) => { if (o.lengthComputable) ilerleme(Math.round((o.loaded / o.total) * 100)); };
    xhr.onerror = () => reddet(new Error('Dosya yüklenemedi: sunucuya ulaşılamadı.'));
    xhr.onload = () => {
      let veri = {};
      try { veri = JSON.parse(xhr.responseText); } catch { veri = {}; }
      if (xhr.status === 423) window.dispatchEvent(new CustomEvent('kasa-kilitli', { detail: veri.mesaj || 'Kasa kilitli.' }));
      if (xhr.status >= 200 && xhr.status < 300 && veri.basarili !== false && veri.dosya) coz(veri.dosya);
      else reddet(Object.assign(new Error(veri.mesaj || `Yükleme başarısız (${xhr.status}).`), { durum: xhr.status }));
    };
    xhr.send(dosya);
  });
}
