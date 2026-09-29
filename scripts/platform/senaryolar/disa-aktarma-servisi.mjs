// PLAYWRIGHT KODUNA DIŞA AKTARMA — sunucu tarafı (GET /platform/senaryo/playwright-kodu). Senaryonun seçilen ortamdaki koşu
// verisi koşucunun okuduğu AYNI kaynaktan gelir (scripts/platform/veri-oku.mjs; çağıran verir), koşu planı aynı fonksiyonla
// kurulur (model-kosusu.mjs > modelKosuPlani) ve kod saf üreticiyle yazılır (playwright-disa-aktarma.mjs). Dosya YAZILMAZ,
// dışarı istek ATILMAZ: yanıt yalnızca üretilen metni taşır (arayüz tarayıcıda indirir). Kasa açık olmalı (plan için).
// Gizli değerler (giriş bilgileri, kasada şifreli senaryo alanları, adı gizli alanlar, kimlik profili alanları, gizli tablo
// sütunları) koda yazılmaz; ortam değişkenine çevrilir. Tipler: disa-aktarma-servisi.d.mts.

import { DepoHatasi, ortamGetir } from '../veritabani/depo.mjs';
import { zarfMi } from '../kasa.mjs';
import { ekGizliAdlar } from '../ayarlar/maskeleme.mjs';
import { modelKosuPlani, modelSenaryosuMu, planHatasiMetni, veriHatalariMetni } from './model-kosusu.mjs';
import { etkinSenaryoGirisi } from './senaryo-girisi.mjs';
import { playwrightKoduUret } from './playwright-disa-aktarma.mjs';
import { bilerekBosAnahtarlari } from '../../dogrulama/senaryo-dogrulayici.mjs';
import { icerikTalepleri } from './talepler.mjs';

/** @param {unknown} d @returns {d is Record<string, any>} */
const nesneMi = (d) => typeof d === 'object' && d !== null && !Array.isArray(d);

/** Değerin (iç içe) içinde kasa zarfı var mı? @param {unknown} d @returns {boolean} */
function zarfIcerir(d) {
  if (Array.isArray(d)) return d.some(zarfIcerir);
  if (nesneMi(d)) return Object.values(d).some(zarfIcerir);
  return zarfMi(d);
}

/** Modeldeki kimlik profili alanlarının alt alan kimlikleri (kişisel değerler). @param {any} model @returns {string[]} */
function kimlikAltAlanlari(model) {
  /** @type {string[]} */
  const idler = [];
  for (const adim of Array.isArray(model?.adimlar) ? model.adimlar : []) {
    for (const bolum of Array.isArray(adim?.bolumler) ? adim.bolumler : []) {
      for (const alan of Array.isArray(bolum?.alanlar) ? bolum.alanlar : []) {
        if (!nesneMi(alan) || alan.tip !== 'kimlikProfili') continue;
        for (const a of Array.isArray(alan.altAlanlar) ? alan.altAlanlar : []) if (nesneMi(a) && typeof a.id === 'string') idler.push(a.id);
      }
    }
  }
  return idler;
}

/**
 * Senaryoyu seçilen ortam için Playwright koduna dışa aktarır.
 * @param {import('../veritabani/baglanti.mjs').Veritabani} db kasa açık
 * @param {{ projeId: string; senaryoId: string; ortamId: string }} istek
 * @param {{ kosuVerisi: (projeId: string, ortamId: string) => Promise<any>; simdi?: Date }} s kosuVerisi: veri-oku.mjs "genel" çıktısı
 */
export async function senaryoyuPlaywrightKodunaAktar(db, istek, s) {
  const { projeId, senaryoId, ortamId } = istek;
  const satir = db.tek('SELECT proje_id, icerik_json FROM senaryolar WHERE id = ?', [senaryoId]);
  if (!satir || String(satir.proje_id) !== projeId) throw new DepoHatasi('Senaryo bulunamadı.');
  const icerik = JSON.parse(String(satir.icerik_json));
  if (!modelSenaryosuMu(icerik)) throw new DepoHatasi('Yalnızca ekran modeliyle koşan senaryolar Playwright koduna dışa aktarılabilir.');
  const ortam = ortamGetir(db, ortamId);
  if (!ortam || ortam.projeId !== projeId) throw new DepoHatasi('Ortam bu projede bulunamadı.');
  const buOrtam = nesneMi(icerik.ortamlar) ? icerik.ortamlar[ortamId] : undefined;
  if (!nesneMi(buOrtam)) throw new DepoHatasi(`Senaryo "${ortam.ad}" ortamında tanımlı değil.`);
  // Kasada şifreli (hassas) alanların anahtarları: değerleri koda yazılmaz.
  const hamVeri = nesneMi(buOrtam.veri) ? buOrtam.veri : {};
  const hassasAnahtarlar = Object.entries(hamVeri).filter(([, v]) => zarfIcerir(v)).map(([k]) => k);

  const d = await s.kosuVerisi(projeId, ortamId);
  if (!nesneMi(d) || typeof d.hata === 'string') throw new DepoHatasi(`Senaryonun koşu verisi okunamadı${nesneMi(d) && d.hata ? `: ${d.hata}` : ''}.`);
  if (d.durum !== 'hazir' || !nesneMi(d.model)) throw new DepoHatasi('Senaryonun koşu verisi okunamadı (veritabanı hazır değil).');
  const sen = (Array.isArray(d.model.senaryolar) ? d.model.senaryolar : []).find((/** @type {any} */ x) => x && x.id === senaryoId);
  if (!sen) throw new DepoHatasi('Senaryo bu ortamın koşu verisinde yok.');
  if (!sen.model) throw new DepoHatasi(`"${sen.baslik}": ekranın modeli yok; dışa aktarılamaz.`);
  if (Array.isArray(sen.veriHatalari) && sen.veriHatalari.length) throw new DepoHatasi(veriHatalariMetni(sen.baslik, sen.veriHatalari).replace(/ Tarayıcı açılmadı\.$/, ''));
  // Koşucuyla (tests/support/model-kosucu.ts) AYNI plan.
  const plan = modelKosuPlani(sen.model, sen.veri, { altModeller: sen.altModeller, mutlakaGorunmeli: sen.mutlakaGorunmeli, kimlikProfilleri: d.model.kimlikProfilleri ?? {} });
  if (plan.hatalar.length) throw new DepoHatasi(planHatasiMetni(sen.baslik, plan.hatalar).replace(/ Tarayıcı açılmadı\.$/, ''));

  const giris = etkinSenaryoGirisi(sen.giris ?? null, sen.model);
  const tarif = nesneMi(d.girisTarifi) && nesneMi(d.girisTarifi.tarif) ? d.girisTarifi.tarif : null;
  const tur = tarif && nesneMi(tarif.baglamDegistirme) ? String(tarif.baglamDegistirme.baglamTuru) : null;
  const profil = plan.baglamProfili;
  const sonuc = playwrightKoduUret({
    plan,
    kaynak: { ekran: sen.ekran?.ad || 'Ekran', senaryo: sen.baslik, modelSurumu: sen.modelSurumu ?? null, ortam: ortam.ad, uretim: (s.simdi ?? new Date()).toISOString(),
      // Talep numaraları (varsa) dosya başında yorum olarak (yalnız metin).
      talepler: icerikTalepleri(icerik) },
    tabanUrl: String(d.model.tabanUrl ?? ortam.tabanUrl ?? ''),
    girisGerekli: giris.kip !== 'girissiz',
    girisProfili: giris.profil,
    tarif,
    baglam: tur ? { profil, degerler: profil ? d.model.baglamProfilleri?.[tur]?.[profil] ?? null : null } : null,
    canli: d.model.canli === true,
    bilerekBos: bilerekBosAnahtarlari(sen.veri),
    gizlilik: {
      hassasAnahtarlar,
      gizliDegerler: Array.isArray(sen.tabloGizliDegerleri) ? sen.tabloGizliDegerleri : [],
      kisiselAlanIdleri: kimlikAltAlanlari(sen.model),
      ekGizliAdlar: ekGizliAdlar(db)
    }
  });
  return { ...sonuc, senaryo: sen.baslik, ortam: ortam.ad };
}
