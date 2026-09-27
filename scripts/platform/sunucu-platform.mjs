// Test sunucusunun (scripts/test-sunucu.mjs) /platform/* uç noktaları: platform veritabanı
// durumu, kasa (oluştur/aç/kilitle/parola değiştir) ve yedek (dışa aktar, otomatik yedek,
// içe aktarma: ÖNİZLEME → SEÇİM → UYGULAMA — bkz. ice-aktarma.mjs).
//
// İçe aktarma uç noktaları:
//   POST /platform/yedek/ice-aktar              ham .tayedek gövdesi + X-Kasa-Parola → { isId } (202)
//                                               (gövde belleğe alınmaz: geçici dosyaya akıtılır, en fazla 20 GB)
//   GET  /platform/yedek/ice-aktar/<id>         ilerleme; hazır olunca önizleme (yeni/degisen/yalnizBurada)
//   POST /platform/yedek/ice-aktar/<id>/uygula  { token, tumu: true } veya { token, secimler: { tablo: [id] } }
//   POST /platform/yedek/ice-aktar/<id>/iptal   { token }
// Ayarlar (proje/ortam/profil CRUD) uç noktaları — hepsi kasa AÇIK olmayı gerektirir
// (kilitliyse 423 KASA_KILITLI, kasa yoksa 409 KASA_YOK):
//   GET  /platform/projeler | ortamlar | giris-profilleri | baglam-profilleri |
//        test-verisi-turleri | test-verisi-profilleri   (?projeId=...)
//   GET  /platform/gecmis?varlikTuru=&varlikId=           (yapan + makine adları eşlemesi)
//   GET  /platform/yedek/otomatik-liste
//   GET  /platform/yedek/tahmin                    dışa aktarma seçenekleri için tahmini medya boyutları
// Dışa aktarma (arka plan işi; büyük yedek belleğe alınmaz, geçici dosyaya akışla yazılır):
//   POST /platform/yedek/disa-aktar              { token, parola, ekranGoruntuleriDahil?, videolarDahil?, izDosyalariDahil? } → { isId } (202)
//   GET  /platform/yedek/disa-aktar/<id>         ilerleme (aşama, yüzde, medya baytı)
//   GET  /platform/yedek/disa-aktar/<id>/indir?token=   hazır yedeği indirir (indirme bitince geçici dosya silinir)
// Giriş tarifleri (ortam ayarlarında, şifreli; gizli değer içermez — bkz. giris/tarif.mjs):
//   GET  /platform/giris-tarifleri?projeId=     ortam başına etkin tarif (kaydedilmiş | proje varsayılanı) +
//                                               bağlam türlerinin alan ADLARI (değer yok) + giriş profillerinin
//                                               ek alan ADLARI (giriş adımlarının "{ad}" yer tutucuları)
//   POST /platform/giris-profili/kaydet { …, ekAlanlar?: [{ ad, gizli, deger?, sil? }] }  gizli ek alan şifreli ('gizli')
//        saklanır, yanıtta maskelidir; "goster" ile alan: "ek:<ad>"
//   POST /platform/giris-tarifi/kaydet | dogrula | sifirla   { projeId, ortamId, tarif }
//   POST /platform/giris-tarifi/oner { projeId, ortamId, girisAdresi? } → YALNIZCA kullanıcı isteyince ortamın
//        giriş sayfasını başsız tarayıcıda açıp seçici önerir (alan doldurmaz, göndermez)
//   POST /platform/<varlik>/kaydet | /sil                 (varlik: proje, ortam, giris-profili,
//        baglam-profili, test-verisi-turu, test-verisi-profili)
//   POST /platform/giris-profili/goster, /platform/test-verisi-profili/goster
//        — AÇIK göster: tek bir gizli değeri düz metin döner (yalnızca kullanıcı isteyince).
// Koşu sonuçları (şema v5; Playwright raporlayıcısı: scripts/platform/raporlayici.mjs):
//   GET  /platform/sonuclar/ozet?projeId=&urun=&baslangic=&bitis=(|&gun=)   ürün listesi, kartlar, trend, koşu geçmişi (aralıkta)
//   GET  /platform/sonuclar/kosu?id=                  koşu detayı (senaryo bazında sonuçlar)
//   GET  /platform/sonuclar/sonuc?id=                 test detayı (hata, adımlar, medya listesi)
//   GET  /platform/sonuclar/kaliplar?projeId=&urun=&baslangic=&bitis=   hata kalıpları
//   GET  /platform/sonuclar/html-rapor?projeId=&tur=ekran|servis&id=&goruntuler=1&hatalar=0|1&adres=1   paylaşılabilir HTML rapor
//        (tek dosya, maskeli; görüntüler kasada çözülüp data: URI olarak gömülür — sonuclar/html-rapor.mjs); &b=<koşu B>: karşılaştırma raporu
//   GET  /platform/sonuclar/karsilastir?projeId=&tur=ekran|servis&a=&b=   iki koşunun yan yana karşılaştırması (+ /senaryo, /adaylar)
//   GET  /platform/sonuclar/html-rapor/onizleme/<id>?token=   son üretilen raporun tek kullanımlık önizlemesi (kendi CSP'si)
//   GET  /platform/servis-sonuclari?projeId=&servisId=&akisId=&ortamId=&denemeler=1   servis / akış koşuları, kalıplar
//   GET  /platform/servis-sonuclari/kosu?projeId=&id=   koşu ayrıntısı · /senaryo?projeId=&id=   istek / yanıt (maskeli)
//   GET  /platform/medya/<id>[?indir=1]               şifreli medyayı ÇÖZEREK akıtır (Range destekli;
//        kasa açık + oturum token'ı gerekir; düz metin diske YAZILMAZ). indir=1 → Content-Disposition.
//   POST /platform/sonuc/durum|medya-anahtari|kosu|kaydet|bitir — YALNIZCA raporlayıcı için: oturum
//        token'ı ya da raporlayıcı token'ı (sunucu belleğinde; koşu alt sürecine verilir) kabul edilir; kasa GEREKMEZ
//        (sonuç metinleri düz, medya dosyaları raporlayıcı sürecinde şifrelenmiş olarak gelir).
// Senaryolar (genel; kimlik = senaryo UUID'si; kasa açık olmalı — bkz. senaryolar/senaryo-servisi.mjs):
//   GET  /platform/senaryolar?projeId=&ortamId=        liste (son sonuç, bağlam profili, beklenen sonuç) + ekranlar;
//        ortamId yoksa birleşik liste (satırda ortamlar: [{ ortamId, tanimli, kosuyaDahil, sonSonuc }])
//   GET  /platform/senaryo?id=&ortamId=                 ayrıntı (verinin hassas alanları çözülmüş — düzenleme formu)
//   GET  /platform/senaryo/form?projeId=&ekranId=&ortamId=&akisId=   seçilen akışın modeli (yoksa varsayılan) + akış listesi +
//        alt modeller + profil seçenekleri (maskeli)
//   GET  /platform/senaryo/gecmis?id=                   değişiklik geçmişi (değişen alan ADLARI; değer yok)
//   GET  /platform/senaryo/son-sonuc?id=&ortamId=       seçili ortamdaki son sonuç + adım sonuçları (akış diyagramı renkleri)
//   POST /platform/senaryo/kaydet | kosuya-dahil | sil | kopyala
//   POST /platform/senaryolar/calistir { projeId, ortamId, senaryoId, kosuId, kosuTuru?, kosuKimligi?, kosuKapsami? }
//        → sunucu UUID'yi güncel test dosyası + başlığına çözer ve mevcut koşu altyapısıyla çalıştırır
//          (koşucu test-sunucu.mjs tarafından platformKosucusunuAyarla ile verilir); koşu bitince yanıt döner.
//   POST /platform/senaryo/dene { projeId, ekranId, ortamId, veri, kosuId, id? } → taslak, geçici ek veriyle denenir.
// Ekranlar (genel; kasa açık olmalı — bkz. ekranlar/ekran-servisi.mjs, sayfa paketi biçimi: docs/sayfa-paketi.md):
//   GET  /platform/ekranlar?projeId=                    ekran listesi (model sürümü, alan/senaryo sayısı, bekleyen analiz)
//   GET  /platform/ekran?projeId=&id=                   ayrıntı: güncel model ağacı, sürüm geçmişi, analiz durumu, kanıtlar
//   GET  /platform/ekran/surum?projeId=&id=&surum=      sürümün ağacı + bir önceki sürüme göre fark
//   GET  /platform/ekran/analiz?projeId=&id=            bekleyen (yoksa son) analiz: bulgular + etki paneli
//   GET  /platform/ekran/akislar?projeId=&ekranId=       ekranın akışları (+ senaryo sayıları, düzenlenebilir mi) — ekranlar/akis-servisi.mjs
//   GET  /platform/ekran/akis/tasarim?projeId=&ekranId=&akisId=|kopya=   akış diyagramı (bloklar + sağ liste; boş: yeni akış)
//   POST /platform/ekran/akis/kaydet { projeId, ekranId, akisId?, ad, bloklar, onay }  onay yoksa etki (etkilenen senaryolar),
//        varsa yeni model sürümü · POST /platform/ekran/akis/varsayilan | sil { projeId, ekranId, akisId }
//   GET  /platform/ortak-akis/ekranlar?projeId=&ekranId=  ortak akışın eklenebileceği ekranlar (ekranId: ortak akış)
//   POST /platform/ortak-akis/ekle { projeId, ekranId, ekranIdleri, istegeBagli, onay }  ortak akışı seçilen ekranların
//        varsayılan akışının sonuna ekler; onay yoksa etki
//   POST /platform/sayfa-paketi/onizle { projeId, paket, ekranId?, mod? }   doğrulama + önizleme (gövde en fazla 16 MB)
//   POST /platform/sayfa-paketi/ekle   { projeId, paket, senaryoIndeksleri, ortamIdleri, testVerisi? }  ekran + model v1 + öneriler
//                                      (+ onaylanan test verisi tabloları / alan bağlantıları; değiştir ve analiz/yukle da alır)
//   POST /platform/ekran/analiz/yukle  { projeId, ekranId, paket }            tekrar analiz → bekleyen bulgular
//   POST /platform/ekran/analiz/uygula { projeId, ekranId, analizId, kabul, red } yalnızca kabul edilenlerle yeni sürüm
//   POST /platform/ekran/analiz/iptal | /platform/ekran/reddedilenleri-unut | /platform/ekran/toplu-ata
//   POST /platform/ekran/senaryolar/tablo-donusumu { projeId, ekranId?, onay?, secimler?: [{ senaryoId, alan }] }  tabloya bağlı
//        alanların düz değerleri → ${Tablo.Sütun} (+ satır seçimi); onay yoksa yalnız plan, onayla yalnız seçilenler (tablolar/ekran-donusumu.mjs)
//   POST /platform/ekran/claude-dosyasi { projeId, ekranId, tur, baglamProfilleri? } → <veritabanı klasörü>/analiz/*.json
//        (gizli değer içermez; Claude API KULLANILMAZ — dosya kullanıcı tarafından Claude Code'a verilir)
// Ekran yönetimi (Ekranlar > ⋯; bkz. ekranlar/ekran-yonetimi.mjs; geçmiş: GET /platform/gecmis?varlikTuru=ekran&varlikId=):
//   POST /platform/ekran/yeniden-adlandir { projeId, ekranId, ad, aciklama? }   görünen ad (anahtar değişmez)
//   POST /platform/ekran/duzenle { projeId, ekranId, urlYolu }                   yeni model sürümü (yalnızca ekranUrl)
//   POST /platform/ekran/sirala { projeId, idler }                               sol listelerdeki sıra
//   POST /platform/ekran/durum { projeId, ekranId, etkin }                       devre dışı bırak / etkinleştir
//   POST /platform/ekran/sil/onizle { projeId, ekranId }                         KURU ÇALIŞTIRMA: silinecek sayılar
//   POST /platform/ekran/sil { projeId, ekranId, onayAdi, sonuclariSil? }        kalıcı sil
//   POST /platform/ekran/geri-yukle { projeId, ekranId }                         silinmiş ekranı (mezar taşı) geri getirir
// Senaryo dosyaları (ŞİFRELİ medya deposunda, tür 'senaryo-dosyasi'; bkz. dosyalar/senaryo-dosyalari.mjs):
//   POST /platform/senaryo-dosyasi/yukle?projeId=&ekranId=&alan=   ham dosya gövdesi + X-Dosya-Adi → { dosya: { id, ad,
//        boyut, referans } } (bellekte şifrelenir; düz metin diske yazılmaz; uzantı modeldeki alanın "kabul"ünden)
//   POST /platform/ekran-dosyasi/yukle?projeId=&ekranId=&yol=<JSON>  ekran ayarındaki dosyayı (ör. ürünün varsayılan
//        Excel'i) değiştirir;  GET /platform/ekran-dosyalari?projeId=  ekran ayarlarındaki dosya değerleri
//   GET  /platform/senaryo-dosyalari?idler=a,b   ad + boyut (içerik ASLA dönmez; /platform/medya da senaryo dosyası sunmaz)
// Yasak adresler: GET /platform/guvenlik → yasakAdresler (ayarlar) + ortamYasakAdresleri (NOBETCI_YASAK_ADRESLER);
//   POST /platform/guvenlik/kaydet { yasakAdresler } — koşu koruması ve ekran taraması kullanır.
// Otomatik kilit: kasa, kimliği doğrulanmış API etkinliği olmadan ayarlanan süre (Ayarlar >
// Güvenlik, 5–120 dk, varsayılan 15) geçince kilitlenir. GET /platform/durum etkinlik SAYILMAZ.
//   GET /platform/guvenlik, POST /platform/guvenlik/kaydet { otomatikKilitDakika }
// Zamanlanmış koşular kilitliyken / açılışta (zamanlama/arka-plan.mjs; üç tercih de varsayılan KAPALI):
//   GET  /platform/zamanlama/tercihler                    tercihler + DPAPI dosyası + Windows görevinin varlığı (schtasks /Query)
//   POST /platform/zamanlama/tercih { ad, acik, parola?, onay? }   ad: kilitliyken | dpapi (parola + onay) | oturumAcilisi (onay)
//   POST /platform/kasa/kilitle { tamamen? }               tercih açıkken varsayılan "arayüzü kilitle, anahtar zamanlayıcıda kalsın"
//   Arka plan kipinde (anahtar yalnız zamanlanmış koşunun işi için bellekte) arayüz KİLİTLİDİR: arayuzKilidindeIzinliMi dışındaki
//   her /platform/* isteği 423 döner; acikVeritabani da arayuzAcikMi'ye bakar.
// Gizli değerler (giriş parolası, TOTP anahtarı, hassas test verisi alanları) listelerde ve
// kaydet yanıtlarında ASLA dönmez: { dolu: true|false, maske: '••••••' } döner. Kaydederken
// alan gönderilmezse (veya boşsa) mevcut değer korunur.
//
// Kasa kilitliyken şifreli sütunlar (ortam adresleri, ayarlar...) okunamaz; /platform/durum
// yalnızca gizli olmayan durum bilgisini döner ve kasa kilitliyken de çalışır.
// Kaba kuvvet koruması: art arda yanlış kasa/yedek parolasında artan bekleme (1,2,4...30 sn).
//
// Güvenlik: test-sunucu.mjs'deki yerel istek (loopback + Host) ve origin kontrolleri bu
// fonksiyon çağrılmadan ÖNCE yapılır. Burada ayrıca her istek aynı token'ı taşımak zorundadır
// (JSON gövdesinde "token", ya da X-Test-Sunucu-Token başlığı / ?token= sorgu parametresi).
// Parolalar yalnızca istek GÖVDESİNDE (JSON) veya ice-aktar için X-Kasa-Parola başlığında
// (encodeURIComponent ile) gelir; URL'de parola kabul edilmez. Parola/anahtar ASLA loglanmaz,
// yanıtlarda dönmez.

import { KATEGORI_SECENEKLERI, siniflandirmaKurallari, siniflandirmaKurallariniKaydet } from './ayarlar/siniflandirma-kurallari.mjs';
import { CEKIRDEK_GIZLI_ADLAR, ekGizliAdlar, ekGizliAdlariKaydet } from './ayarlar/maskeleme.mjs';
import { KOSU_AYAR_TANIMLARI, kosuAyarlariniKaydet, kosuAyarlariniOku, kosuOrtamDegiskenleri, varsayilanKosuAyarlari } from './ayarlar/kosu-ayarlari.mjs';
import { rehberAyarlariniKaydet, rehberAyarlariniOku } from './ayarlar/rehber-ayarlari.mjs';
import { acilisTercihiniKaydet, acilisTercihiniOku } from './ayarlar/acilis-tercihi.mjs';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir, hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEGISIKLIK_SAYACI_META } from './veritabani/baglanti.mjs';
import {
  CalismaAlaniHatasi, ILK_ALAN_ADI, VERITABANI_DOSYASI, alanAcildi, alanKaldir, alanOlustur, alanProjeSayisiniYaz, alanYenidenAdlandir,
  alanYollari, kayitDefteriniHazirla, sonAcilaniTemizle, veriKoku
} from './calisma-alanlari.mjs';
import { sunucuBaglantisiniSil, sunucuBaglantisiniYaz } from './sunucu-baglantisi.mjs';
import { projeSilmeOnizlemesi, projeyiSil, varsayilanProjeAyarla, varsayilanProjeKimligi } from './proje-yonetimi.mjs';
import { GUNCEL_SEMA_SURUMU } from './veritabani/gocler.mjs';
import {
  DepoHatasi, ayarGetir, ayarYaz, baglamProfiliKaydet, ekranAyarlariniGetir, ekranKaydet, ekranlariListele, baglamProfiliSil, baglamProfilleriniListele, degisiklikGecmisiListele,
  girisProfiliGetir, girisProfiliKaydet, girisProfiliSil, girisProfilleriniListele, makineleriListele, ortamGetir,
  ortamKaydet, ortamSil, ortamlariListele, platformDurumOzeti, projeGetir, projeKaydet, projeleriListele,
  testVerisiProfiliGetir, testVerisiProfiliKaydet, testVerisiProfiliSil, testVerisiProfilleriniListele,
  testVerisiTuruKaydet, testVerisiTuruSil, testVerisiTurleriniListele, veritabaniniHazirla, yerelMakine
} from './veritabani/depo.mjs';
import {
  KasaHatasi, MEDYA_ANAHTARI_META, MIN_PAROLA_UZUNLUGU, ParolaDenemeSiniri, acikAnahtar, arayuzAcikMi, arkaPlanKipindeMi, kasaAc, kasaAcikMi,
  kasaDurumu, kasaKilitle, kasaOlustur, medyaAnahtariniAc, medyaAnahtariniHazirla, parolaDegistir, parolayiDogrula, zarfMi
} from './kasa.mjs';
import {
  eskiSonuclariSil, hataKaliplari, kosuDetayi, kosuKaydet, kosudakiSonucuBul, kosuyuBitir, medyaGetir, sonucDetayi, sonucKaydet, sonucOzeti
} from './veritabani/sonuc-deposu.mjs';
import { MedyaHatasi, medyaBoyutu, medyaCoz, medyaDosyaAdiGecerliMi, medyaDosyasiniSil, medyaKlasoru, medyaSaklamaTemizligi } from './medya.mjs';
import {
  YEDEK_UZANTISI, YedekHatasi, medyaSeciminiCoz, otomatikYedekAl, varsayilanYedekKlasoru, yedekBoyutTahmini, yedekDosyasiYaz
} from './yedek.mjs';
import { IceAktarmaYoneticisi, MASKE } from './ice-aktarma.mjs';
import {
  SenaryoCakismaHatasi, SenaryoDogrulamaHatasi, ekranGirdileri, formBaglami, senaryoGecmisiniSil, kosuyaDahilAyarla,
  modelBaglami, senaryoDetayi, senaryoGecmisi, senaryoKaydet, senaryoKopyala, senaryolariCogalt, senaryoListesi, senaryoSonSonucu, senaryolariSil
} from './senaryolar/senaryo-servisi.mjs';
import { senaryoCalistir, senaryoDene } from './senaryolar/calistirma.mjs';
import { YASAK_ADRES_DEGISKENI, adresYasakliMi } from './senaryolar/model-kosusu.mjs';
import {
  etkinYasakAdresler, etkinYasakDesenleri, ayarlardakiYasakAdresler, ortamdakiYasakAdresler, yasakAdresleriKaydet, YASAK_ADRES_EN_COK
} from './guvenlik/yasak-adresler.mjs';
import {
  DOSYA_BOYUT_SINIRI, SENARYO_DOSYASI_TURU, dosyaSahipleriniBagla, kabulUzantilari, referansCoz, referanslariBul,
  sahipsizSenaryoDosyalariniTemizle, senaryoDosyasiBilgisi, senaryoDosyasiEkle
} from './dosyalar/senaryo-dosyalari.mjs';
import { formSemasiOlustur, tumFormAlanlari } from './senaryolar/model-formu.mjs';
import { etkinGirisTarifi, girisTarifiKaydet, girisTarifiniSifirla } from './giris/tarif-deposu.mjs';
import { ADIM_ETIKETLERI, ADIM_ISLEMLERI, GIRIS_ADIM_ISLEMLERI, girisTarifiniDogrula } from './giris/tarif.mjs';
import { girisSayfasiniOner } from './giris/algilama.mjs';
import { IzinHatasi, izinDegisiklikleri, izinDegistir, izinleriOku } from './guvenlik/izinler.mjs';
import { CanliOnayHatasi, denetlenenUclar, ucDenetle } from './guvenlik/uc-denetimi.mjs';
import {
  EkranDogrulamaHatasi, analizGetir, analizIptal, analizUygula, analizYukle, claudeDosyasiYaz, ekranDetayi, ekranListesi, paketOnizle,
  reddedilenleriUnut, sayfaEkle, surumAyrintisi, topluDegerAta, modeliPaketleDegistir
} from './ekranlar/ekran-servisi.mjs';
import { akisKaydet, akisSil, akisTasarimi, akisVarsayilanYap, akislariListele, ortakAkisAdaylari, ortakAkisEkranlaraEkle } from './ekranlar/akis-servisi.mjs';
import { PAKET_BOYUT_SINIRI } from './ekranlar/sayfa-paketi.mjs';
import {
  ekranDurumunuAyarla, ekranDuzenle, ekranGeriYukle, ekranlariSirala, ekranSil, ekranSilmeOnizlemesi, ekranYenidenAdlandir
} from './ekranlar/ekran-yonetimi.mjs';
import { taramaIsteginiIsle, taramaSuruyorMu } from './tarama/yonetici.mjs';
import { SERVIS_BUYUK_GOVDE_UCLARI, SERVIS_GET_UCLARI, SERVIS_POST_UCLARI } from './servisler/servis-uclari.mjs';
import { TABLO_GET_UCLARI, TABLO_POST_UCLARI, tabloKosuDenetimiAyarla } from './tablolar/tablo-uclari.mjs';
import { ekranTabloDonusumu } from './tablolar/ekran-donusumu.mjs';
import { SQL_GET_UCLARI } from './sql/sorgu-bagdastirici.mjs';
import { SQL_KULLANIM_GET_UCLARI, SQL_KULLANIM_POST_UCLARI } from './sql/sql-kullanimi.mjs';
import { AKIS_SENARYO_GET_UCLARI, AKIS_SENARYO_POST_UCLARI } from './servisler/akis-senaryosu.mjs';
import { ENTEGRASYON_BUYUK_GOVDE_UCLARI, ENTEGRASYON_GET_UCLARI, entegrasyonPostUclari } from './entegrasyonlar/uclar.mjs';
import { kosuBittiBildir } from './entegrasyonlar/servis.mjs';
import { servisAkisiCalistir } from './servisler/servis-akislari.mjs';
import { zamanlayiciOlustur, zamanliKosuyuYurut } from './zamanlama/zamanlayici.mjs';
import { ZAMANLAMA_POST_UCLARI, zamanlamaGetUclari } from './zamanlama/uclar.mjs';
import { arayuzKilidindeIzinliMi, arkaPlanIsiBaslat, emanetiSil } from './zamanlama/anahtar-emaneti.mjs';
import { arkaPlanYoneticisi } from './zamanlama/arka-plan.mjs';
import { SERVIS_SONUC_UCLARI } from './sonuclar/servis-sonuclari.mjs';
import { KARSILASTIRMA_UCLARI, karsilastirmaRaporuOlustur } from './sonuclar/karsilastirma.mjs';
import {
  gosterimMaskesi, hataKaliplariniMaskele, kosuDetayiniMaskele, servisSonucunuMaskele, sonucDetayiniMaskele
} from './sonuclar/gosterim-maskesi.mjs';
import { sorgudanAralik } from './sonuclar/aralik.mjs';
import { ONIZLEME_BASLIKLARI, htmlRaporuOlustur, onizlemeAl, onizlemeSakla } from './sonuclar/html-rapor.mjs';

export const JSON_GOVDE_SINIRI = 64 * 1024;
/** Sayfa paketi uçlarının gövde sınırı (paket, base64 ekran görüntüleri içerebilir). */
const PAKET_UCLARI = new Set(['/platform/sayfa-paketi/onizle', '/platform/sayfa-paketi/ekle', '/platform/ekran/analiz/yukle', '/platform/ekran/model/degistir', '/platform/tablo/kaydet', ...SERVIS_BUYUK_GOVDE_UCLARI]);
for (const u of ENTEGRASYON_BUYUK_GOVDE_UCLARI) PAKET_UCLARI.add(u);
/** Raporlayıcının sonuç gövdesi (hata mesajları + adımlar) için daha geniş sınır. */
export const SONUC_GOVDE_SINIRI = 4 * 1024 * 1024;
/** İçe aktarılacak yedeğin üst sınırı (videolu yedekler büyük olabilir; gövde diske akıtılır). */
export const YEDEK_YUKLEME_SINIRI = 20 * 1024 * 1024 * 1024;
const PROJE_KOKU = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---------------------------------------------------------------------------------------
// Çalışma alanları (bkz. calisma-alanlari.mjs): sunucu aynı anda YALNIZCA BİR çalışma alanıyla çalışır.
// PLATFORM_VERITABANI verilmişse (testler / özel kurulum) "sabit" tek çalışma alanı kullanılır; kayıt defterine
// bakılmaz, çalışma alanı kapatılamaz/değiştirilemez.
// ---------------------------------------------------------------------------------------
const SABIT_VERITABANI = process.env.PLATFORM_VERITABANI && process.env.PLATFORM_VERITABANI.trim()
  ? resolve(process.env.PLATFORM_VERITABANI.trim()) : null;
/** Veri kökü (NOBETCI_VERI_KOKU ya da <proje kökü>/veri): kayıt defteri + çalışma alanları. */
const VERI_KOKU = veriKoku(PROJE_KOKU);
/** @type {{ id: string; ad: string; veritabani: string; sabit: boolean } | null} */
let aktifAlan = null;
let alanlarHazir = false;

/**
 * Açılışta (ve ilk istekte) bir kez: kayıt defteri yoksa oluşturulur — mevcut <veri kökü>/platform.db YERİNDE ilk
 * çalışma alanı olarak kaydedilir (dosya taşınmaz). Son açılan çalışma alanı etkin olur (kasa kilitli başlar).
 */
export function platformCalismaAlanlariniHazirla() {
  if (alanlarHazir) return;
  alanlarHazir = true;
  if (SABIT_VERITABANI) {
    aktifAlan = { id: 'sabit', ad: 'PLATFORM_VERITABANI', veritabani: SABIT_VERITABANI, sabit: true };
    return;
  }
  const { defter, yerindeKaydedildi } = kayitDefteriniHazirla(VERI_KOKU);
  if (yerindeKaydedildi) {
    console.log(`[platform] Mevcut veritabanı yerinde ilk çalışma alanı olarak kaydedildi ("${ILK_ALAN_ADI}"); dosyalar taşınmadı.`);
  }
  const son = defter.sonAcilan ? defter.alanlar.find((a) => a.id === defter.sonAcilan) : undefined;
  if (son) aktifAlan = { id: son.id, ad: son.ad, veritabani: alanYollari(VERI_KOKU, son).veritabani, sabit: false };
}

/** Açık çalışma alanının veritabanı yolu (yoksa null). */
const veritabaniYolu = () => {
  platformCalismaAlanlariniHazirla();
  return aktifAlan ? aktifAlan.veritabani : null;
};
/** Kayıtlı tüm çalışma alanlarının veritabanı yolları (açılış temizliği için; kayıt defteri okunamazsa yalnızca açık olan). */
export function platformTumVeritabaniYollari() {
  platformCalismaAlanlariniHazirla();
  if (aktifAlan?.sabit) return [aktifAlan.veritabani];
  try {
    const { defter } = kayitDefteriniHazirla(VERI_KOKU);
    return defter.alanlar.map((a) => alanYollari(VERI_KOKU, a).veritabani);
  } catch {
    return aktifAlan ? [aktifAlan.veritabani] : [];
  }
}
/** Açık çalışma alanının veritabanı yolu; açık çalışma alanı yoksa CalismaAlaniHatasi (409). */
function acikVeritabaniYolu() {
  const yol = veritabaniYolu();
  if (!yol) throw new CalismaAlaniHatasi('KAPALI', 'Açık bir çalışma alanı yok. Başlangıç ekranından bir çalışma alanı açın ya da oluşturun.');
  return yol;
}
/** Test sunucusu için: açık çalışma alanının veritabanı yolu (yoksa veri kökündeki varsayılan — yalnızca geçici klasör adı için). */
export function platformVeritabaniYolu() {
  return veritabaniYolu() ?? join(VERI_KOKU, VERITABANI_DOSYASI);
}
/**
 * Model/senaryo koşularının seçenekleri: yasaklı adres kalıpları (Ayarlar > Güvenlik > "Yasak adresler" +
 * NOBETCI_YASAK_ADRESLER) her istekte okunur.
 * @param {import('./veritabani/baglanti.mjs').Veritabani | null} db
 */
const calistirmaSecenekleri = (db) => ({ yasakDesenleri: etkinYasakDesenleri(db) });
/** Şifreli medya klasörü: veritabanının yanındaki medya/ (varsayılan veri/medya/). */
const medyaKlasoruYolu = () => medyaKlasoru(acikVeritabaniYolu());
/** Claude analiz/istek dosyaları: veritabanının yanındaki analiz/ (varsayılan veri/analiz/; Git'e girmez). */
const analizKlasoruYolu = () => join(dirname(acikVeritabaniYolu()), 'analiz');

/** @type {import('./veritabani/baglanti.mjs').Veritabani | null} */
let vt = null;
/** @type {Promise<import('./veritabani/baglanti.mjs').Veritabani> | null} */
let vtSozu = null;

/**
 * Açık çalışma alanının veritabanını (tek örnek) döner. Çalışma alanı açık değilse null; dosya yoksa ve olustur=false
 * ise null döner (durum sorgusu boş bir veritabanı dosyası YARATMAZ). olustur=true ve açık çalışma alanı yoksa hata.
 * @param {{ olustur?: boolean }} [secenekler]
 */
async function platformVeritabani(secenekler = {}) {
  if (vt) return vt;
  const yol = secenekler.olustur ? acikVeritabaniYolu() : veritabaniYolu();
  if (!yol) return null;
  if (!secenekler.olustur && !existsSync(yol)) return null;
  vtSozu ??= veritabaniniHazirla(yol).then((acilan) => (vt = acilan)).finally(() => { vtSozu = null; });
  return vtSozu;
}

// ---------------------------------------------------------------------------------------
// Otomatik kilit (hareketsizlik)
// ---------------------------------------------------------------------------------------
export const OTOMATIK_KILIT_VARSAYILAN_DK = 15;
export const OTOMATIK_KILIT_EN_AZ_DK = 5;
export const OTOMATIK_KILIT_EN_COK_DK = 120;
const GUVENLIK_AYAR_ANAHTARI = 'guvenlik';
/** Dakikanın milisaniye karşılığı — YALNIZCA doğrulama/test için PLATFORM_OTOMATIK_KILIT_DAKIKA_MS ile kısaltılabilir. */
const DAKIKA_MS = Number(process.env.PLATFORM_OTOMATIK_KILIT_DAKIKA_MS) > 0 ? Number(process.env.PLATFORM_OTOMATIK_KILIT_DAKIKA_MS) : 60_000;
let otomatikKilitDakika = OTOMATIK_KILIT_VARSAYILAN_DK;
let sonEtkinlik = Date.now();
/** Son otomatik kilitlenme zamanı (arayüz kilit ekranında açıklama gösterir). */
let otomatikKilitZamani = /** @type {string | null} */ (null);

/** Kimliği doğrulanmış API etkinliği: hareketsizlik sayacını sıfırlar (test-sunucu da çağırır). */
export function platformEtkinligiBildir() {
  sonEtkinlik = Date.now();
}

/** Kasa açıldığında kayıtlı süreyi yükler. @param {import('./veritabani/baglanti.mjs').Veritabani} db */
function guvenlikAyariniYukle(db) {
  try {
    const ayar = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(db, GUVENLIK_AYAR_ANAHTARI));
    const dk = Number(ayar?.otomatikKilitDakika);
    otomatikKilitDakika = Number.isInteger(dk) && dk >= OTOMATIK_KILIT_EN_AZ_DK && dk <= OTOMATIK_KILIT_EN_COK_DK ? dk : OTOMATIK_KILIT_VARSAYILAN_DK;
  } catch {
    otomatikKilitDakika = OTOMATIK_KILIT_VARSAYILAN_DK;
  }
  sonEtkinlik = Date.now();
  otomatikKilitZamani = null;
}

setInterval(() => {
  if (!vt || !arayuzAcikMi(vt)) return;
  if (Date.now() - sonEtkinlik < otomatikKilitDakika * DAKIKA_MS) return;
  // Tercih ("kilitliyken de çalışsın" / DPAPI) açıksa arayüz kilitlenir, anahtar yalnız zamanlayıcının emanetinde kalır.
  arkaPlan.kilitle(vt);
  otomatikKilitZamani = new Date().toISOString();
  console.log(`[platform] Kasa ${otomatikKilitDakika} dakika işlem yapılmadığı için otomatik kilitlendi.`);
}, Math.min(5_000, DAKIKA_MS)).unref();

/** @type {import('./senaryolar/calistirma.d.mts').Kosucu | null} */
let kosucu = null;
/**
 * Test sunucusu, senaryo çalıştırma altyapısını (Playwright süreci, dosya sırası, canlı görüntü,
 * durdurma) buradan platform uçlarına verir. Verilmezse /platform/senaryolar/calistir ve
 * /platform/senaryo/dene "çalıştırıcı etkin değil" hatası döner.
 * @param {import('./senaryolar/calistirma.d.mts').Kosucu | null} yeni
 */
export function platformKosucusunuAyarla(yeni) {
  kosucu = yeni;
}
/** @param {string} dosya @param {string} ad */
const kosuyorMu = (dosya, ad) => Boolean(kosucu?.kosuyorMu?.(dosya, ad));
// Tablo değeri değişince senaryo güncellemesinde koşan senaryolar atlanır (tablolar/tablo-etkisi.mjs).
tabloKosuDenetimiAyarla(kosuyorMu);

/**
 * Zamanlanmış koşular (Ayarlar > Koşu; bkz. zamanlama/*.mjs): kasa AÇIKKEN dakikada bir denetlenir; vakti gelen kural
 * "Koşuyu başlat" ile aynı yoldan (senaryoCalistir + bu koşucu) koşar. Kasa kilitliyse hiçbir şey yapılmaz — kullanıcı
 * "kilitliyken de çalışsın" / DPAPI tercihini açtıysa anahtar emanetten arka plan kipinde (arayüz kilitli) kullanılır.
 */
const zamanlayici = zamanlayiciOlustur({
  veritabani: () => (vt && kasaAcikMi(vt) ? vt : null),
  arkaPlanIsi: () => (vt ? arkaPlanIsiBaslat(vt) : null),
  mesgulMu: () => Boolean(kosucu?.mesgulMu?.()),
  yurut: (db, kural, kosuKimligi, devamMi) => zamanliKosuyuYurut(db, kural, kosuKimligi, {
    senaryolar: (d, projeId, ortamId) => senaryoListesi(d, projeId, ortamId).senaryolar,
    senaryoCalistir: (d, govde) => senaryoCalistir(d, govde, kosucu, calistirmaSecenekleri(d)),
    servisAkisiCalistir: (d, projeId, girdi) => servisAkisiCalistir(d, projeId, girdi),
    bildir: (d, kosuId, baglantiIdleri) => kosuBittiBildir(d, kosuId, { baglantiIdleri }),
    devamMi
  }),
  log: (m) => console.log(m)
});

/** Test sunucusu başlarken çağırır: zamanlanmış koşuların dakikalık denetimi. */
export function platformZamanlanmisKosulariBaslat() {
  zamanlayici.baslat();
  // Windows oturumuna bağlı otomatik açma (DPAPI dosyası varsa): anahtar YALNIZ zamanlayıcının emanetine; arayüz kilitli başlar.
  void platformVeritabani().then((db) => arkaPlan.acilistaYukle(db)).catch(() => { /* ayrıntı Ayarlar > Koşu'da */ });
}

/** Arka plan kipi mi (anahtar yalnız zamanlayıcının işi için bellekte, arayüz kilitli)? test-sunucu canlı görüntü uçlarını kapatır. */
export function platformArayuzKilitliMi() {
  return Boolean(vt && arkaPlanKipindeMi(vt));
}

/**
 * Nöbetçi'nin başlattığı test süreçlerine verilecek ortam değişkenleri: kasa AÇIKSA türetilmiş
 * anahtar (base64url) — yalnızca alt sürecin belleğinde durur, hiçbir dosyaya yazılmaz. Kasa
 * kilitliyse boş döner (testler veriyi okuyamaz; koşular kasa açıkken başlatılır).
 * @returns {Record<string, string>}
 */
/** Koşu ayarları (Ayarlar > Koşu); kasa kilitliyse varsayılanlar. */
function kosuAyarlari() {
  return vt && kasaAcikMi(vt) ? kosuAyarlariniOku(vt) : varsayilanKosuAyarlari();
}

/** Tek koşunun süre limiti (ms): Ayarlar > Koşu; TEST_SUNUCU_SURE_LIMITI_DK yalnızca geliştirme / test için ezer. */
export function platformKosuSureLimitiMs() {
  const ezme = Number(process.env.TEST_SUNUCU_SURE_LIMITI_DK);
  return (ezme > 0 ? ezme : kosuAyarlari().kosuSureLimitiDk) * 60 * 1000;
}

export function platformTestOrtami() {
  // Alt süreç (Playwright, veri okuyucu, raporlayıcı) AÇIK çalışma alanının veritabanını kullanır (kayıt defterine bakmaz).
  const yol = veritabaniYolu();
  /** @type {Record<string, string>} */
  const alan = yol ? { PLATFORM_VERITABANI: yol } : {};
  if (!vt || !kasaAcikMi(vt)) return { ...alan, ...kosuOrtamDegiskenleri(varsayilanKosuAyarlari()) };
  try {
    Object.assign(alan, kosuOrtamDegiskenleri(kosuAyarlariniOku(vt)));
    // Yasak adresler (ayarlar + ortam değişkeni): alt süreçteki koşu koruması (global-setup, model koşucusu) okur.
    const yasak = etkinYasakAdresler(vt);
    return { ...alan, PLATFORM_KASA_ANAHTARI: acikAnahtar(vt).toString('base64url'), ...(yasak.length ? { [YASAK_ADRES_DEGISKENI]: yasak.join(',') } : {}) };
  } catch {
    return alan;
  }
}

// ---------------------------------------------------------------------------------------
// Koşu sonuçları ve şifreli medya
// ---------------------------------------------------------------------------------------
const MEDYA_AYAR_ANAHTARI = 'medya';
export const VIDEO_SAKLAMA_VARSAYILAN_GUN = 30;

/**
 * Video saklama süresi (gün): Ayarlar > Güvenlik'te kaydedilen değer (kasa açıkken okunur),
 * yoksa .env VIDEO_SAKLAMA_GUN, yoksa 30.
 * @param {import('./veritabani/baglanti.mjs').Veritabani | null} db
 */
export function videoSaklamaGunu(db) {
  if (db && kasaAcikMi(db)) {
    try {
      const ayar = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(db, MEDYA_AYAR_ANAHTARI));
      const gun = Number(ayar?.videoSaklamaGun);
      // Okuma eski üst sınırla (3650) kalır: önceden kaydedilmiş uzun süre geçersiz sayılıp varsayılana (daha kısa) düşülürse
      // videolar erken silinirdi. Yeni kayıt 365 günle sınırlıdır (/platform/ayarlar/medya).
      if (Number.isInteger(gun) && gun >= 1 && gun <= 3650) return gun;
    } catch { /* varsayılana düşülür */ }
  }
  const ortam = Number(process.env.VIDEO_SAKLAMA_GUN);
  return Number.isFinite(ortam) && ortam > 0 ? ortam : VIDEO_SAKLAMA_VARSAYILAN_GUN;
}

/**
 * Sonuçlar veritabanına mı yazılıyor? (Veritabanı + kasa var ve proje — verilmezse herhangi bir proje — veritabanında.)
 * Test sunucusu buna göre: kasa kilitliyse koşu başlatmaz.
 * @param {string | null} [projeId]
 */
export async function platformSonucKaydiEtkinMi(projeId = null) {
  const db = await platformVeritabani();
  if (!db || !kasaDurumu(db).olusturuldu) return false;
  if (projeId) return Boolean(db.tek('SELECT id FROM projeler WHERE id = ?', [projeId]));
  return Boolean(db.tek('SELECT id FROM projeler LIMIT 1'));
}

/** Kasa açık mı (sunucunun veritabanında)? */
export async function platformKasaAcikMi() {
  const db = await platformVeritabani();
  return Boolean(db && kasaAcikMi(db));
}

/**
 * Canlı panel için: koşudaki senaryonun sonucu (durum, hata, son ekran görüntüsü + video medya kimliği).
 * @param {string} kosuId @param {string} senaryoAnahtari
 */
export async function platformKosuSonucu(kosuId, senaryoAnahtari) {
  const db = await platformVeritabani();
  if (!db) return null;
  const bulunan = kosudakiSonucuBul(db, kosuId, { senaryoAnahtari });
  if (!bulunan) return null;
  // Gösterim maskesi (bilinen gizli değerler, adı gizli alanlar …): saklanan sonuç değişmez.
  const m = gosterimMaskesi(db, bulunan.detay.projeId);
  const d = sonucDetayiniMaskele(bulunan.detay, m);
  return {
    durum: d.hamDurum ?? d.durum, platformDurumu: d.durum, sureMs: d.sureMs, hataMesaji: d.hataMesaji,
    basarisizAdim: bulunan.basarisizAdim ? m.ad(bulunan.basarisizAdim) : null, ekranGoruntusuId: bulunan.sonEkranGoruntusuId, videoId: bulunan.videoId, sonucId: d.id
  };
}

/**
 * Koşu sonucu okunamadığında gösterilen çıktı hata özeti: koşunun projesinin gizli değerleriyle maskelenir.
 * @param {string | null | undefined} metin @param {string} kosuId @returns {Promise<string | null>}
 */
export async function platformHataOzetiniMaskele(metin, kosuId) {
  if (!metin) return metin ?? null;
  const db = await platformVeritabani();
  const projeId = db && kasaAcikMi(db) ? db.tek('SELECT proje_id FROM kosular WHERE id = ?', [kosuId])?.proje_id : null;
  return db ? gosterimMaskesi(db, projeId == null ? null : String(projeId)).metin(metin) : metin;
}

/**
 * Süreç kapandı ama koşu hâlâ "çalışıyor" görünüyorsa (ör. zorla kapatıldı, raporlayıcı onEnd'e
 * ulaşamadı) koşuyu verilen durumla kapatır.
 * @param {string} kosuId @param {'tamamlandi' | 'durduruldu' | 'zaman_asimi' | 'hata'} durum
 */
export async function platformKosusunuKapat(kosuId, durum) {
  const db = await platformVeritabani();
  if (!db) return;
  const k = db.tek('SELECT durum FROM kosular WHERE id = ?', [kosuId]);
  if (k && k.durum === 'calisiyor') kosuyuBitir(db, kosuId, { durum });
}

/** Günlük (ve açılışta) medya saklama temizliği: eski videolar + sahipsiz şifreli dosyalar. */
export function platformMedyaTemizligiZamanla() {
  const calistir = async () => {
    try {
      const db = await platformVeritabani();
      if (!db) return;
      // Sonuç saklama (kullanıcı kararı; varsayılan süresiz): önce eski sonuç satırları, sonra sahipsiz kalan medya dosyaları.
      if (kasaAcikMi(db)) {
        const saklamaGun = kosuAyarlariniOku(db).sonucSaklamaGun;
        const s = eskiSonuclariSil(db, saklamaGun);
        if (s.kosu || s.servisKosusu || s.akisKosusu) console.log(`[platform] Sonuç saklama: ${saklamaGun} günden eski ${s.kosu} koşu (${s.sonuc} sonuç), ${s.servisKosusu} servis ve ${s.akisKosusu} akış koşusu silindi.`);
      }
      const gun = videoSaklamaGunu(db);
      const sonuc = medyaSaklamaTemizligi(db, medyaKlasoruYolu(), { videoGun: gun });
      if (sonuc.silinenVideo || sonuc.silinenSahipsiz) {
        console.log(`[platform] Medya temizliği: ${gun} günden eski ${sonuc.silinenVideo} video, ${sonuc.silinenSahipsiz} sahipsiz şifreli dosya silindi.`);
      }
      // Yüklenip hiçbir senaryoya/ekran ayarına bağlanmayan (1 günden eski) senaryo dosyaları — kasa açık olmalı
      // (ekran ayarları şifreli); kilitliyse bir sonraki temizliğe kalır.
      if (kasaAcikMi(db)) {
        const d = sahipsizSenaryoDosyalariniTemizle(db, medyaKlasoruYolu());
        if (d.silinen) console.log(`[platform] Kullanılmayan ${d.silinen} senaryo dosyası (şifreli) silindi.`);
      }
    } catch (hata) {
      console.error(`[platform] Medya temizliği yapılamadı: ${/** @type {Error} */ (hata)?.message ?? hata}`);
    }
  };
  setTimeout(calistir, 5_000).unref();
  setInterval(calistir, 24 * 60 * 60 * 1000).unref();
}

/**
 * Kaba kuvvet sayacı ÇALIŞMA ALANI BAŞINA (kasa açma, parola değiştirme, dışa aktarma ve yedek parolası): bir çalışma
 * alanındaki yanlış parolalar diğerlerini bekletmez. denemeSiniri her zaman açık çalışma alanınınkine yönlenir.
 * @type {Map<string, ParolaDenemeSiniri>}
 */
const denemeSinirlari = new Map();
/** @param {string} id */
function alanSiniri(id) {
  let s = denemeSinirlari.get(id);
  if (!s) { s = new ParolaDenemeSiniri(); denemeSinirlari.set(id, s); }
  return s;
}
const aktifSinir = () => alanSiniri(aktifAlan?.id ?? '-');
const denemeSiniri = /** @type {ParolaDenemeSiniri} */ (/** @type {unknown} */ ({
  kalanMs: () => aktifSinir().kalanMs(),
  kontrolEt: () => aktifSinir().kontrolEt(),
  basarisiz: () => aktifSinir().basarisiz(),
  basarili: () => aktifSinir().basarili(),
  dene: (/** @type {() => Promise<unknown>} */ fn) => aktifSinir().dene(fn)
}));
/** Zamanlanmış koşuların kilitliyken / açılışta çalışma tercihleri (A: bellek, B: DPAPI, C: oturum açılışı görevi). */
const arkaPlan = arkaPlanYoneticisi({
  veritabaniYolu, projeKoku: PROJE_KOKU, denemeSiniri,
  // YALNIZCA doğrulama örnekleri (birim testlerinin geçici sunucusu): Windows Görev Zamanlayıcı'ya hiç dokunulmaz (schtasks çağrılmaz).
  ...(process.env.TEST_SUNUCU_WINDOWS_GOREVI_KAPALI === '1'
    ? { gorevYurutucu: async () => { throw new Error('Bu sunucu örneğinde Windows görevi kapalı (TEST_SUNUCU_WINDOWS_GOREVI_KAPALI=1).'); } }
    : {})
});
const iceAktarma = new IceAktarmaYoneticisi({
  veritabani: (olustur) => platformVeritabani({ olustur }),
  medyaKlasoru: medyaKlasoruYolu,
  denemeSiniri
});
setInterval(() => { iceAktarma.temizle(); disaAktarmaTemizle(); }, 5 * 60 * 1000).unref();

/** Yüklenen yedeklerin geçici klasörü (veritabanının yanında; dosyalar zaten şifreli). */
const yuklemeKlasoru = () => join(dirname(acikVeritabaniYolu()), '.gecici-yukleme');
/** Bir günden eski (çöken bir yüklemeden kalan) geçici yükleme dosyalarını siler. */
function eskiYuklemeleriTemizle() {
  const yol = veritabaniYolu();
  if (!yol) return;
  const klasor = join(dirname(yol), '.gecici-yukleme');
  if (!existsSync(klasor)) return;
  for (const ad of readdirSync(klasor)) {
    if (!/^yukleme-[a-f0-9]{16}\.tayedek$/.test(ad)) continue;
    try {
      if (Date.now() - statSync(join(klasor, ad)).mtimeMs > 24 * 60 * 60 * 1000) unlinkSync(join(klasor, ad));
    } catch { /* yok sayılır */ }
  }
}

// ---------------------------------------------------------------------------------------
// Dışa aktarma işleri (arka planda geçici dosyaya yazılır, sonra indirilir)
// ---------------------------------------------------------------------------------------
const DISA_AKTARMA_SAKLAMA_MS = 60 * 60 * 1000;
/**
 * @typedef {{
 *   id: string; durum: 'hazirlaniyor' | 'hazir' | 'hata'; asama: string; yuzde: number;
 *   bayt: { islenen: number; toplam: number } | null; mesaj: string | null; dosya: string; dosyaAdi: string;
 *   boyut: number | null; medya: import('./yedek.mjs').YedekMedyaOzeti | null; sonKullanma: number;
 * }} DisaAktarmaIsi
 */
/** @type {Map<string, DisaAktarmaIsi>} */
const disaAktarmaIsleri = new Map();

/** Süresi dolan (indirilmemiş) dışa aktarma dosyalarını siler. @param {boolean} [hepsi] */
function disaAktarmaTemizle(hepsi = false) {
  for (const [id, is] of disaAktarmaIsleri) {
    if (is.durum === 'hazirlaniyor' && !hepsi) continue;
    if (!hepsi && is.sonKullanma > Date.now()) continue;
    try { unlinkSync(is.dosya); } catch { /* zaten yok */ }
    disaAktarmaIsleri.delete(id);
  }
}

/** @param {DisaAktarmaIsi} is */
const disaAktarmaGorunumu = (is) => ({
  id: is.id, durum: is.durum, asama: is.asama, yuzde: is.yuzde, bayt: is.bayt, mesaj: is.mesaj,
  dosyaAdi: is.dosyaAdi, boyut: is.boyut, medya: is.medya
});

// ---------------------------------------------------------------------------------------
// Çalışma alanı açma / kapatma / değişiklik izi
// ---------------------------------------------------------------------------------------
/** "Son dışa aktarma" işareti (meta; gizli değil): { sayac, zaman } — sayac: dışa aktarma başlarkenki değişiklik sayacı. */
const SON_DISA_AKTARMA_META = 'son_disa_aktarma';

/**
 * Son dışa aktarımdan beri değişiklik var mı? (Kasa gerekmez; meta şifresiz.) Hiç dışa aktarılmamışsa değişti sayılır.
 * @param {import('./veritabani/baglanti.mjs').Veritabani} db
 */
export function degisiklikDurumu(db) {
  const sayac = Number(db.metaOku(DEGISIKLIK_SAYACI_META) ?? 0) || 0;
  /** @type {{ sayac?: unknown; zaman?: unknown } | null} */
  let isaret = null;
  try { isaret = JSON.parse(db.metaOku(SON_DISA_AKTARMA_META) ?? 'null'); } catch { isaret = null; }
  const sonDisaAktarma = isaret && typeof isaret.zaman === 'string' ? isaret.zaman : null;
  return { sayac, sonDisaAktarma, degisti: !isaret || Number(isaret.sayac) !== sayac };
}

/** Sunucunun bağlantı bilgisi (terminal koşularının raporlayıcısı için açık çalışma alanının yanına yazılır). */
/** @type {{ adres: string; token: string } | null} */
let sunucuBaglantisi = null;
/** test-sunucu.mjs dinlemeye başlayınca çağırır; açık çalışma alanının yanına bağlantı dosyası yazılır. @param {{ adres: string; token: string }} b */
export function platformSunucuBaglantisiniAyarla(b) {
  sunucuBaglantisi = b;
  baglantiDosyasiniYaz();
}
function baglantiDosyasiniYaz() {
  const yol = veritabaniYolu();
  if (!sunucuBaglantisi || !yol) return;
  try {
    mkdirSync(dirname(yol), { recursive: true });
    sunucuBaglantisiniYaz(yol, sunucuBaglantisi);
  } catch (hata) {
    console.error(`[platform] Sunucu bağlantı dosyası yazılamadı (terminal koşuları sonuçları doğrudan yazar): ${/** @type {Error} */ (hata).message}`);
  }
}
/** Sunucu kapanırken: bağlantı dosyası silinir, kasa kilitlenir. */
export function platformKapanirken() {
  const yol = veritabaniYolu();
  if (yol) sunucuBaglantisiniSil(yol);
  if (vt) emanetiSil(vt);
  if (vt && kasaAcikMi(vt)) kasaKilitle(vt);
}

/** Proje sayısını (veritabanında şifresiz) kayıt defterine yazar — seçim ekranında gösterilir. @param {import('./veritabani/baglanti.mjs').Veritabani | null} db */
function projeSayisiniKaydet(db) {
  if (!db || !aktifAlan || aktifAlan.sabit) return;
  try {
    alanProjeSayisiniYaz(VERI_KOKU, aktifAlan.id, Number(db.tek('SELECT COUNT(*) AS n FROM projeler')?.n ?? 0));
  } catch { /* kayıt defteri yazılamadı: yalnızca gösterim bilgisi */ }
}

/**
 * Çalışma alanı değiştirilebilir mi? Koşu, tarama, içe/dışa aktarma, proje dosyası aktarımı ya da giriş önerisi
 * sürüyorsa açık bir mesajla reddedilir.
 */
function mesgulNedeni() {
  if (kosucu?.mesgulMu?.()) return 'Bir test koşusu sürüyor';
  if (taramaSuruyorMu()) return 'Bir ekran taraması sürüyor';
  if (iceAktarma.aktifIs()) return 'Bir yedek içe aktarması sürüyor';
  if ([...disaAktarmaIsleri.values()].some((i) => i.durum === 'hazirlaniyor')) return 'Bir dışa aktarma sürüyor';
  if (girisOnerisiSuruyor) return 'Giriş sayfası önerisi sürüyor';
  if (vtSozu) return 'Veritabanı açılıyor';
  return null;
}
function mesgulDegilOlmali() {
  const neden = mesgulNedeni();
  if (neden) throw new CalismaAlaniHatasi('MESGUL', `${neden}. Bitmesini bekleyin (ya da durdurun), sonra tekrar deneyin.`);
}

/**
 * Açık çalışma alanını kapatır: kasa kilitlenir, veritabanı bırakılır, içe aktarma hazırlıkları atılır, bağlantı dosyası
 * silinir. Hiç veritabanı oluşturulmamış (yarım kalmış) çalışma alanı kayıt defterinden de kaldırılır.
 * @param {{ sonAcilaniUnut?: boolean }} [secenekler] sonAcilaniUnut: açılışta seçim ekranı gelsin
 */
function alaniKapat(secenekler = {}) {
  if (aktifAlan?.sabit) throw new CalismaAlaniHatasi('SABIT', 'Bu sunucu tek bir veritabanıyla (PLATFORM_VERITABANI) başlatıldı; çalışma alanı kapatılamaz.');
  mesgulDegilOlmali();
  const eski = aktifAlan;
  if (vt) {
    projeSayisiniKaydet(vt);
    emanetiSil(vt);
    if (kasaAcikMi(vt)) kasaKilitle(vt);
    vt.kapat();
    vt = null;
  }
  iceAktarma.hepsiniAt();
  otomatikKilitZamani = null;
  aktifAlan = null;
  if (!eski) return;
  sunucuBaglantisiniSil(eski.veritabani);
  if (!existsSync(eski.veritabani)) {
    // Kurulumu tamamlanmamış (kasa/yedek hiç oluşmamış) boş çalışma alanı iz bırakmaz.
    try { alanKaldir(VERI_KOKU, eski.id, eski.ad); } catch { /* yok sayılır */ }
  } else if (secenekler.sonAcilaniUnut) {
    sonAcilaniTemizle(VERI_KOKU);
  }
  console.log('[platform] Çalışma alanı kapatıldı.');
}

/**
 * Kayıttaki bir çalışma alanını açar: veritabanı dosyası varsa ve kasası oluşturulmuşsa parola doğrulanır (çalışma alanı
 * başına kaba kuvvet beklemesi); başarılıysa açık çalışma alanı kapatılıp bu açılır. Yanlış parolada hiçbir şey değişmez.
 * @param {string} id @param {string} parola
 */
async function alaniAc(id, parola) {
  platformCalismaAlanlariniHazirla();
  if (aktifAlan?.sabit) throw new CalismaAlaniHatasi('SABIT', 'Bu sunucu tek bir veritabanıyla (PLATFORM_VERITABANI) başlatıldı; çalışma alanı değiştirilemez.');
  const { defter } = kayitDefteriniHazirla(VERI_KOKU);
  const alan = defter.alanlar.find((a) => a.id === id);
  if (!alan) throw new CalismaAlaniHatasi('BULUNAMADI', 'Çalışma alanı bulunamadı.');
  const yollar = alanYollari(VERI_KOKU, alan);
  const zatenAcik = aktifAlan?.id === id;
  if (!zatenAcik) mesgulDegilOlmali();
  const sinir = alanSiniri(id);
  /** @type {import('./veritabani/baglanti.mjs').Veritabani | null} */
  let aday = null;
  if (existsSync(yollar.veritabani)) {
    sinir.kontrolEt();
    aday = zatenAcik && vt ? vt : await veritabaniniHazirla(yollar.veritabani);
    try {
      // Arka plan kipinde (anahtar yalnız zamanlayıcının işi için bellekte) de parola sorulur.
      if (kasaDurumu(aday).olusturuldu && !arayuzAcikMi(aday)) {
        const acilan = aday;
        await sinir.dene(() => kasaAc(acilan, parola));
      }
    } catch (hata) {
      if (aday !== vt) aday.kapat();
      throw hata;
    }
  }
  if (!zatenAcik) {
    try {
      alaniKapat();
    } catch (hata) {
      if (aday && aday !== vt) aday.kapat();
      throw hata;
    }
    vt = aday;
    aktifAlan = { id: alan.id, ad: alan.ad, veritabani: yollar.veritabani, sabit: false };
  }
  if (vt && arayuzAcikMi(vt)) {
    yerelMakine(vt);
    guvenlikAyariniYukle(vt);
    arkaPlan.kasaAcildi(vt);
  }
  alanAcildi(VERI_KOKU, alan.id, vt ? { projeSayisi: Number(vt.tek('SELECT COUNT(*) AS n FROM projeler')?.n ?? 0) } : {});
  baglantiDosyasiniYaz();
  console.log('[platform] Çalışma alanı açıldı.');
  return { id: alan.id, ad: alan.ad };
}

/** Seçim ekranı listesi (gizli bilgi yok: ad, zamanlar, proje sayısı, bekleme). */
function calismaAlaniListesi() {
  platformCalismaAlanlariniHazirla();
  if (aktifAlan?.sabit) {
    return { sabit: true, aktifId: aktifAlan.id, alanlar: [{ id: aktifAlan.id, ad: aktifAlan.ad, aktif: true, veritabaniVar: existsSync(aktifAlan.veritabani), olusturulma: null, sonAcilma: null, projeSayisi: null, beklemeSaniye: 0 }] };
  }
  const { defter } = kayitDefteriniHazirla(VERI_KOKU);
  return {
    sabit: false,
    aktifId: aktifAlan?.id ?? null,
    alanlar: defter.alanlar.map((a) => ({
      id: a.id, ad: a.ad, aktif: a.id === aktifAlan?.id, veritabaniVar: existsSync(alanYollari(VERI_KOKU, a).veritabani),
      olusturulma: a.olusturulma, sonAcilma: a.sonAcilma, projeSayisi: a.projeSayisi,
      beklemeSaniye: Math.ceil(alanSiniri(a.id).kalanMs() / 1000)
    })).sort((x, y) => String(y.sonAcilma ?? y.olusturulma).localeCompare(String(x.sonAcilma ?? x.olusturulma)))
  };
}

/** Hata → HTTP durum kodu + güvenli (gizli bilgi içermeyen) mesaj. @param {unknown} hata */
function hataYaniti(hata) {
  // Kapalı izin (Ayarlar > İzinler): işlem yapılmadı; arayüz standart uyarıyı + "İzinlere git" düğmesini gösterir (ortak.js > api).
  if (hata instanceof IzinHatasi) return { durum: 403, govde: { basarili: false, kod: hata.kod, izin: hata.izin, etiket: hata.etiket, mesaj: hata.message } };
  if (hata instanceof CanliOnayHatasi) return { durum: 409, govde: { basarili: false, kod: hata.kod, mesaj: hata.message } };
  if (hata instanceof KasaHatasi) {
    const kodlar = { PAROLA_KISA: 400, PAROLA_YANLIS: 403, KASA_KILITLI: 423, KASA_YOK: 409, KASA_VAR: 409, ZARF_BOZUK: 400, COK_DENEME: 429 };
    return {
      durum: kodlar[hata.kod] ?? 400,
      govde: { basarili: false, kod: hata.kod, mesaj: hata.message, ...(hata.bekleSaniye ? { bekleSaniye: hata.bekleSaniye } : {}) }
    };
  }
  if (hata instanceof YedekHatasi) {
    const kodlar = { ONAY_GEREKLI: 409, DEGISTI: 409, MESGUL: 409, BULUNAMADI: 404 };
    return { durum: kodlar[hata.kod] ?? 400, govde: { basarili: false, kod: hata.kod, mesaj: hata.message } };
  }
  if (hata instanceof SenaryoDogrulamaHatasi) {
    return { durum: 400, govde: { basarili: false, kod: 'DOGRULAMA', mesaj: hata.message, hatalar: hata.hatalar, uyarilar: hata.uyarilar } };
  }
  if (hata instanceof SenaryoCakismaHatasi) return { durum: 409, govde: { basarili: false, kod: 'CAKISMA', mesaj: hata.message } };
  if (hata instanceof EkranDogrulamaHatasi) return { durum: 400, govde: { basarili: false, kod: 'DOGRULAMA', mesaj: hata.message, hatalar: hata.hatalar } };
  if (hata instanceof DepoHatasi) return { durum: 400, govde: { basarili: false, kod: 'VERI', mesaj: hata.message } };
  if (hata instanceof CalismaAlaniHatasi) {
    const kodlar = { GECERSIZ: 400, BULUNAMADI: 404, AYNI_AD: 409, BOZUK: 500, ACIK: 409, ONAY: 400, MESGUL: 409, SABIT: 409, KAPALI: 409 };
    return { durum: kodlar[hata.kod] ?? 400, govde: { basarili: false, kod: hata.kod === 'KAPALI' ? 'CALISMA_ALANI_YOK' : hata.kod, mesaj: hata.message } };
  }
  return null;
}

/** @param {import('node:http').IncomingMessage} req @param {number} sinir */
function ikiliGovdeOku(req, sinir) {
  return new Promise((coz, reddet) => {
    const uzunluk = Number(req.headers['content-length'] ?? NaN);
    if (Number.isFinite(uzunluk) && uzunluk > sinir) {
      reddet(Object.assign(new Error('Yüklenen dosya çok büyük.'), { cokBuyuk: true }));
      return;
    }
    /** @type {Buffer[]} */
    const parcalar = [];
    let toplam = 0;
    let bitti = false;
    req.on('data', (/** @type {Buffer} */ parca) => {
      if (bitti) return;
      toplam += parca.length;
      if (toplam > sinir) {
        bitti = true;
        reddet(Object.assign(new Error('Yüklenen dosya çok büyük.'), { cokBuyuk: true }));
        req.resume();
        return;
      }
      parcalar.push(parca);
    });
    req.on('end', () => { if (!bitti) { bitti = true; coz(Buffer.concat(parcalar)); } });
    req.on('error', (h) => { if (!bitti) { bitti = true; reddet(h); } });
  });
}

/**
 * İstek gövdesini (belleğe almadan) dosyaya akıtır. Sınır aşılırsa dosya silinir.
 * @param {import('node:http').IncomingMessage} req @param {string} yol @param {number} sinir
 * @returns {Promise<number>} yazılan bayt
 */
function govdeyiDosyayaYaz(req, yol, sinir) {
  return new Promise((coz, reddet) => {
    const uzunluk = Number(req.headers['content-length'] ?? NaN);
    if (Number.isFinite(uzunluk) && uzunluk > sinir) {
      req.resume();
      reddet(Object.assign(new Error('Yüklenen dosya çok büyük.'), { cokBuyuk: true }));
      return;
    }
    mkdirSync(dirname(yol), { recursive: true });
    const cikis = createWriteStream(yol, { flags: 'wx', mode: 0o600 });
    let toplam = 0;
    let bitti = false;
    /** @param {Error} hata */
    const basarisiz = (hata) => {
      if (bitti) return;
      bitti = true;
      req.unpipe(cikis);
      cikis.destroy();
      try { unlinkSync(yol); } catch { /* zaten yok */ }
      req.resume();
      reddet(hata);
    };
    req.on('data', (/** @type {Buffer} */ parca) => {
      toplam += parca.length;
      if (toplam > sinir) basarisiz(Object.assign(new Error('Yüklenen dosya çok büyük.'), { cokBuyuk: true }));
    });
    req.on('error', basarisiz);
    req.on('aborted', () => basarisiz(new Error('Yükleme yarıda kesildi.')));
    cikis.on('error', basarisiz);
    cikis.on('finish', () => { if (!bitti) { bitti = true; coz(toplam); } });
    req.pipe(cikis);
  });
}

/** @param {Date} t */
function dosyaZamani(t) {
  return t.toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
}

// ---------------------------------------------------------------------------------------
// Ayarlar CRUD (kasa açık olmalı). Gizli değerler maskelenir.
// ---------------------------------------------------------------------------------------

/** @typedef {import('./veritabani/baglanti.mjs').Veritabani} Veritabani */

/** "Koşu bitti" bildirimi: aynı koşudan bu süre yeni "bitir" gelmezse gönderilir (toplu koşuda tek özet). */
const KOSU_BILDIRIM_BEKLEMESI_MS = 60_000;
/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const bekleyenKosuBildirimleri = new Map();

/** Kasa açık veritabanı; değilse KasaHatasi (KASA_YOK / KASA_KILITLI). */
async function acikVeritabani() {
  const db = await platformVeritabani();
  if (!db) throw new KasaHatasi('KASA_YOK', 'Kasa henüz oluşturulmamış.');
  acikAnahtar(db);
  // Arka plan kipi (anahtar yalnız zamanlanmış koşunun işi için bellekte): arayüz için kasa KİLİTLİDİR.
  if (!arayuzAcikMi(db)) throw new KasaHatasi('KASA_KILITLI', 'Kasa kilitli. Önce kasa parolasıyla kasayı açın.');
  return db;
}

/** @param {boolean} dolu */
const maskeli = (dolu) => ({ dolu, maske: dolu ? MASKE : '' });
/** @param {unknown} d */
const metinAl = (d) => (typeof d === 'string' ? d : '');
/** @param {unknown} d */
const secimliMetin = (d) => (typeof d === 'string' && d !== '' ? d : undefined);
/** @param {unknown} d @param {string} alan */
function kimlikAl(d, alan = 'id') {
  if (typeof d !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(d)) throw new DepoHatasi(`"${alan}" geçersiz.`);
  return d;
}
/** @param {unknown} d */
const secimliKimlik = (d) => (d === undefined || d === null || d === '' ? undefined : kimlikAl(d));
/** Sonuçlar ekranında ürün seçimi: ekran kimliği ya da ekransız ürün için "ad:<ürün adı>". @param {unknown} d */
function urunSecimi(d) {
  if (d === undefined || d === null || d === '') return null;
  if (typeof d === 'string' && d.startsWith('ad:') && d.length <= 203) return d;
  return kimlikAl(d, 'urun');
}
/** Profil ortam kapsamı: alan gönderilmezse undefined (mevcut korunur), '' / null = tüm ortamlar. @param {unknown} d */
const ortamSecimi = (d) => (d === undefined ? undefined : d === null || d === '' ? null : kimlikAl(d, 'ortamId'));

/**
 * Ortamın arayüze giden görünümü: ayarlar (giriş tarifi vb.) gönderilmez; yalnızca "canli" işareti ve taban adresleri
 * (ortamın asıl adresi + sonradan eklenenler; servis / ekran eklerken seçilir).
 * @param {import('./veritabani/depo.mjs').Ortam} o
 */
function ortamGorunumu(o) {
  const { ayarlar, ...gorunum } = o;
  const ekler = Array.isArray(ayarlar.tabanAdresleri) ? ayarlar.tabanAdresleri.filter((x) => typeof x === 'string') : [];
  return { ...gorunum, canli: ayarlar.canli === true, tabanAdresleri: [o.tabanUrl, ...ekler] };
}

/** @param {import('./veritabani/depo.mjs').GirisProfili} p */
function girisProfiliGorunumu(p) {
  const sms = /** @type {Record<string, unknown>} */ (p.smsAyari ?? {});
  return {
    id: p.id, projeId: p.projeId, ortamId: p.ortamId, ad: p.ad, kullaniciAdi: p.kullaniciAdi, ikiAsamaliTur: p.ikiAsamaliTur,
    parola: maskeli(p.parolaVar), totpGizli: maskeli(p.totpGizliVar),
    // SMS: "sabit" = sabit test kodu (şifreli sütunda, gizli değil), "elle" = koşu sırasında elle girilir.
    sms: { yontem: sms.yontem === 'elle' ? 'elle' : sms.yontem === 'sabit' ? 'sabit' : null, kod: typeof sms.kod === 'string' ? sms.kod : '' },
    // Ek alanlar (giriş adımlarının "{ad}" değerleri): gizli olanın değeri gelmez, yalnızca maske.
    ekAlanlar: (p.ekAlanlar ?? []).map((e) => (e.gizli ? { ad: e.ad, gizli: true, deger: maskeli(e.degerVar) } : { ad: e.ad, gizli: false, deger: e.deger ?? '' })),
    guncellenme: p.guncellenme
  };
}

/** @param {import('./veritabani/depo.mjs').TestVerisiProfili} p */
function testVerisiProfiliGorunumu(p) {
  /** @type {Record<string, unknown>} */
  const degerler = {};
  for (const [ad, deger] of Object.entries(p.degerler)) {
    degerler[ad] = p.hassasAlanlar.includes(ad) ? maskeli(p.doluHassasAlanlar.includes(ad)) : deger;
  }
  for (const ad of p.doluHassasAlanlar) if (!(ad in degerler)) degerler[ad] = maskeli(true);
  return { id: p.id, projeId: p.projeId, turId: p.turId, ortamId: p.ortamId, ad: p.ad, degerler, hassasAlanlar: p.hassasAlanlar, guncellenme: p.guncellenme };
}

/** Ortam seçimi: verilen kimlik (projede olmalı) ya da projenin varsayılan ortamı. @param {Veritabani} db @param {string} projeId @param {unknown} d */
function ortamSec(db, projeId, d) {
  const ortamlar = ortamlariListele(db, projeId);
  if (d !== undefined && d !== null && d !== '') {
    const id = kimlikAl(d, 'ortamId');
    if (!ortamlar.some((o) => o.id === id)) throw new DepoHatasi('Ortam bulunamadı.');
    return id;
  }
  const o = ortamlar.find((x) => x.varsayilan) ?? ortamlar[0];
  if (!o) throw new DepoHatasi('Projede ortam yok.');
  return o.id;
}

/**
 * Giriş tarifi görünümü (tarifte gizli değer yoktur). @param {Veritabani} db @param {string} projeId @param {import('./veritabani/depo.mjs').Ortam} o
 */
function girisTarifiGorunumu(db, projeId, o) {
  const etkin = etkinGirisTarifi(db, projeId, o.id);
  return {
    ortamId: o.id, ortamAd: o.ad, tabanUrl: o.tabanUrl, varsayilan: o.varsayilan, canli: o.ayarlar?.canli === true, kaynak: etkin.kaynak, tarif: etkin.tarif, hatalar: etkin.hatalar
  };
}
/** "Varsayılanları öner" aynı anda tek bir tarayıcı açsın. */
let girisOnerisiSuruyor = false;

// ---------------------------------------------------------------------------------------
// Senaryo dosyaları (şifreli; bkz. dosyalar/senaryo-dosyalari.mjs) ve ekranların dosya ayarları
// ---------------------------------------------------------------------------------------

/**
 * Değerdeki dosya referanslarının üst bilgisi (ad, boyut; içerik ASLA dönmez) — arayüz dosya adını/boyutunu gösterir.
 * @param {Veritabani} db @param {unknown} deger
 * @returns {Record<string, { id: string; ad: string; boyut: number | null; olusturulma?: string; eksik?: boolean }>}
 */
function dosyaBilgileri(db, deger) {
  /** @type {Record<string, { id: string; ad: string; boyut: number | null; olusturulma?: string; eksik?: boolean }>} */
  const sonuc = {};
  for (const r of referanslariBul(deger)) {
    const b = senaryoDosyasiBilgisi(db, r.id);
    sonuc[r.referans] = b ? { id: b.id, ad: b.ad, boyut: b.boyut, olusturulma: b.olusturulma } : { id: r.id, ad: r.ad, boyut: null, eksik: true };
  }
  return sonuc;
}

/** Dosya uzantısı taşıyan düz yol değeri mi (ör. eski "tests/fixtures/a.xlsx")? @param {unknown} d */
const eskiDosyaYoluMu = (d) => typeof d === 'string' && d.length <= 500 && !referansCoz(d) && !/^[a-z][a-z0-9+.-]*:/i.test(d)
  && /(^|\/)[^/\\]+\.(xlsx|xls|csv|txt|json|xml|pdf|png|jpe?g|docx|zip)$/i.test(d.trim()) && /[\\/]/.test(d);

/**
 * Ekran ayarlarındaki dosya değerleri (ör. ürünün varsayılan çoklu sorgu Excel'i): şifreli referanslar ve henüz
 * taşınmamış eski düz yollar. yol: ayarlar içindeki JSON yolu (ortam kimliği dahil).
 * @param {Veritabani} db @param {string} projeId
 */
function ekranDosyalari(db, projeId) {
  const ortamlar = new Map(ortamlariListele(db, projeId).map((o) => [o.id, o.ad]));
  const ekranlar = [];
  for (const e of ekranlariListele(db, projeId)) {
    const ayarlar = ekranAyarlariniGetir(db, e.id) ?? {};
    /** @type {Array<{ yol: string[]; ortamId: string | null; ortamAd: string | null; anahtar: string; dosya: { id: string; ad: string; boyut: number | null; eksik?: boolean } | null; eskiYol: string | null }>} */
    const dosyalar = [];
    const gez = (/** @type {unknown} */ d, /** @type {string[]} */ yol) => {
      if (Array.isArray(d)) { d.forEach((x, i) => gez(x, [...yol, String(i)])); return; }
      if (d && typeof d === 'object') { for (const [k, v] of Object.entries(d)) gez(v, [...yol, k]); return; }
      const ref = referansCoz(d);
      if (!ref && !eskiDosyaYoluMu(d)) return;
      // Veri güdümlü senaryo dizileri (ör. senaryolar[...]) ekran ayarı değil; atlanır.
      if (yol.some((p) => /^\d+$/.test(p))) return;
      const ortamId = yol[0] === 'ortamlar' && ortamlar.has(yol[1]) ? yol[1] : null;
      const b = ref ? senaryoDosyasiBilgisi(db, ref.id) : null;
      dosyalar.push({
        yol, ortamId, ortamAd: ortamId ? ortamlar.get(ortamId) ?? null : null, anahtar: yol[yol.length - 1],
        dosya: ref ? (b ? { id: b.id, ad: b.ad, boyut: b.boyut } : { id: ref.id, ad: ref.ad, boyut: null, eksik: true }) : null,
        eskiYol: ref ? null : String(d)
      });
    };
    gez(ayarlar, []);
    if (dosyalar.length) ekranlar.push({ id: e.id, ad: e.ad, anahtar: e.anahtar, dosyalar });
  }
  return { ekranlar };
}

/**
 * Ekran ayarındaki bir dosya değerini yeni referansla değiştirir (değer bir dosya değeri olmalı).
 * @param {Veritabani} db @param {string} projeId @param {string} ekranId @param {unknown} yolHam @param {string} referans
 */
function ekranDosyasiniDegistir(db, projeId, ekranId, yolHam, referans) {
  const ekran = ekranlariListele(db, projeId).find((e) => e.id === ekranId);
  if (!ekran) throw new DepoHatasi('Ekran bulunamadı.');
  if (!Array.isArray(yolHam) || !yolHam.length || yolHam.length > 20 || !yolHam.every((p) => typeof p === 'string' && p.length <= 200)) {
    throw new DepoHatasi('"yol" geçersiz.');
  }
  const yol = /** @type {string[]} */ (yolHam);
  const ayarlar = /** @type {Record<string, unknown>} */ (ekranAyarlariniGetir(db, ekranId) ?? {});
  /** @type {Record<string, unknown>} */
  let n = ayarlar;
  for (const p of yol.slice(0, -1)) {
    const alt = n[p];
    if (!alt || typeof alt !== 'object' || Array.isArray(alt)) throw new DepoHatasi('Ayar bulunamadı.');
    n = /** @type {Record<string, unknown>} */ (alt);
  }
  const son = yol[yol.length - 1];
  if (!(son in n) || !(referansCoz(n[son]) || eskiDosyaYoluMu(n[son]))) throw new DepoHatasi('Bu ayar bir dosya değeri değil.');
  n[son] = referans;
  ekranKaydet(db, { id: ekran.id, projeId, anahtar: ekran.anahtar, ad: ekran.ad, aciklama: ekran.aciklama, ayarlar });
  dosyaSahipleriniBagla(db, 'ekran', ekran.id, referans);
}

/**
 * Senaryo formundaki dosya alanının kabul ettiği uzantılar (modelden): alan bulunamazsa DepoHatasi.
 * @param {Veritabani} db @param {string} ekranId @param {string} alan formdaki senaryo anahtarı
 */
function dosyaAlaniKabulu(db, ekranId, alan) {
  const mb = modelBaglami(db, ekranId);
  if (!mb) throw new DepoHatasi('Ekranın modeli yok.');
  // Çoklu akış: alan herhangi bir akışta olabilir.
  for (const akis of mb.akislar) {
    const m = akis.id === mb.akisId ? mb : modelBaglami(db, ekranId, akis.id);
    if (!m) continue;
    const a = tumFormAlanlari(formSemasiOlustur(m.model, m.altModeller)).find((x) => x.anahtar === alan && x.tip === 'dosya');
    if (a) return a.kabul ?? null;
  }
  throw new DepoHatasi('Modelde bu adla bir dosya alanı yok.');
}

/** @type {Map<string, (db: Veritabani, q: URLSearchParams) => Record<string, unknown> | Promise<Record<string, unknown>>>} */
const GET_UCLARI = new Map([
  // Giriş tarifleri (ortam başına; kaydedilmiş ya da projenin varsayılanı) + bağlam türlerinin ALAN ADLARI (değer yok).
  ['/platform/giris-tarifleri', (db, q) => {
    const projeId = kimlikAl(q.get('projeId'), 'projeId');
    /** @type {Map<string, Set<string>>} */
    const turler = new Map();
    for (const b of baglamProfilleriniListele(db, projeId)) {
      if (!turler.has(b.tur)) turler.set(b.tur, new Set());
      for (const ad of Object.keys(b.alanlar ?? {})) /** @type {Set<string>} */ (turler.get(b.tur)).add(ad);
    }
    return {
      ortamlar: ortamlariListele(db, projeId).map((o) => girisTarifiGorunumu(db, projeId, o)),
      baglamTurleri: [...turler].map(([tur, alanlar]) => ({ tur, alanlar: [...alanlar] })),
      adimIslemleri: ADIM_ISLEMLERI.map((islem) => ({ islem, etiket: ADIM_ETIKETLERI[islem] })),
      // Giriş adımları: özel adımlar (kullanıcı adı / parola / giriş düğmesi) + genel adımlar; "{ad}" = giriş profilinin ek alanı.
      girisAdimIslemleri: GIRIS_ADIM_ISLEMLERI.map((islem) => ({ islem, etiket: ADIM_ETIKETLERI[islem] })),
      ekAlanAdlari: [...new Set(girisProfilleriniListele(db, projeId).flatMap((p) => p.ekAlanlar.map((e) => e.ad)))]
    };
  }],
  ['/platform/senaryolar', (db, q) => {
    const projeId = kimlikAl(q.get('projeId'), 'projeId');
    // ortamId verilmezse BİRLEŞİK liste (tüm senaryolar; satırda ortam başına tanım / Koşuda / son sonuç).
    const ham = q.get('ortamId');
    if (ham === null || ham === '') return { ortamId: null, ...senaryoListesi(db, projeId, null) };
    const ortamId = ortamSec(db, projeId, ham);
    return { ortamId, ...senaryoListesi(db, projeId, ortamId) };
  }],
  ['/platform/senaryo', (db, q) => {
    const id = kimlikAl(q.get('id'));
    const ortamId = q.get('ortamId') ? kimlikAl(q.get('ortamId'), 'ortamId') : null;
    const senaryo = senaryoDetayi(db, id, ortamId);
    // Dosya alanlarının üst bilgisi (ad, boyut): form dosyanın adını/boyutunu gösterir; içerik dönmez.
    return { senaryo, dosyalar: dosyaBilgileri(db, senaryo.veri) };
  }],
  ['/platform/senaryo-dosyalari', (db, q) => {
    /** @type {Record<string, { id: string; ad: string; boyut: number }>} */
    const dosyalar = {};
    for (const id of String(q.get('idler') ?? '').split(',').filter(Boolean).slice(0, 100)) {
      const b = senaryoDosyasiBilgisi(db, kimlikAl(id));
      if (b) dosyalar[id] = { id: b.id, ad: b.ad, boyut: b.boyut };
    }
    return { dosyalar };
  }],
  ['/platform/ekran-dosyalari', (db, q) => ekranDosyalari(db, kimlikAl(q.get('projeId'), 'projeId'))],
  ['/platform/senaryo/form', (db, q) => {
    const projeId = kimlikAl(q.get('projeId'), 'projeId');
    const akisId = q.get('akisId');
    return formBaglami(db, projeId, kimlikAl(q.get('ekranId'), 'ekranId'), ortamSec(db, projeId, q.get('ortamId')),
      akisId && /^[A-Za-z][A-Za-z0-9]{0,99}$/.test(akisId) ? akisId : null);
  }],
  ['/platform/senaryo/son-sonuc', (db, q) => {
    const id = kimlikAl(q.get('id'));
    const son = senaryoSonSonucu(db, id, kimlikAl(q.get('ortamId'), 'ortamId'));
    const ham = son ? sonucDetayi(db, son.sonucId) : null;
    const d = ham ? sonucDetayiniMaskele(ham, gosterimMaskesi(db, ham.projeId)) : null;
    // Yalnızca diyagramın gereksindiği özet: adım adları/durumları ve hata metni (medya ve veri yok).
    return {
      sonuc: son && d ? {
        id: son.sonucId, kosuId: son.kosuId, durum: son.durum, zaman: son.zaman, sureMs: d.sureMs, hataMesaji: d.hataMesaji,
        adimlar: d.adimlar, atlananAlanlar: d.atlananAlanlar
      } : null
    };
  }],
  ['/platform/senaryo/gecmis', (db, q) => ({
    kayitlar: senaryoGecmisi(db, kimlikAl(q.get('id'))),
    makineler: Object.fromEntries(makineleriListele(db).map((m) => [m.id, m.ad]))
  })],
  ['/platform/ekranlar', (db, q) => ekranListesi(db, kimlikAl(q.get('projeId'), 'projeId'))],
  ['/platform/ekran', (db, q) => {
    const projeId = kimlikAl(q.get('projeId'), 'projeId');
    return ekranDetayi(db, projeId, kimlikAl(q.get('id')));
  }],
  // Değer listesi formu: ekranın inputları ve seçenekleri.
  ['/platform/ekran/girdiler', (db, q) => ekranGirdileri(db, kimlikAl(q.get('projeId'), 'projeId'), kimlikAl(q.get('ekranId'), 'ekranId'))],
  ['/platform/ekran/surum', (db, q) => {
    const surum = Number(q.get('surum'));
    if (!Number.isInteger(surum) || surum < 1) throw new DepoHatasi('"surum" geçersiz.');
    return surumAyrintisi(db, kimlikAl(q.get('projeId'), 'projeId'), kimlikAl(q.get('id')), surum);
  }],
  ['/platform/ekran/analiz', (db, q) => analizGetir(db, kimlikAl(q.get('projeId'), 'projeId'), kimlikAl(q.get('id')))],
  ['/platform/ekran/akislar', (db, q) => akislariListele(db, kimlikAl(q.get('projeId'), 'projeId'), kimlikAl(q.get('ekranId'), 'ekranId'))],
  ['/platform/ortak-akis/ekranlar', (db, q) => ortakAkisAdaylari(db, kimlikAl(q.get('projeId'), 'projeId'), kimlikAl(q.get('ekranId'), 'ekranId'))],
  ['/platform/ekran/akis/tasarim', (db, q) => {
    const akisKimligi = (/** @type {string | null} */ d) => (d && /^[A-Za-z][A-Za-z0-9]{0,99}$/.test(d) ? d : null);
    return akisTasarimi(db, kimlikAl(q.get('projeId'), 'projeId'), kimlikAl(q.get('ekranId'), 'ekranId'), { akisId: akisKimligi(q.get('akisId')), kopya: akisKimligi(q.get('kopya')) });
  }],
  ['/platform/projeler', (db) => ({
    projeler: projeleriListele(db).map((p) => ({ id: p.id, ad: p.ad, aciklama: p.aciklama })),
    varsayilanId: varsayilanProjeKimligi(db)
  })],
  // Ortam ayarları (aktarımda eski dosya iskeleti vb.) arayüze gönderilmez.
  ['/platform/ortamlar', (db, q) => ({ ortamlar: ortamlariListele(db, kimlikAl(q.get('projeId'), 'projeId')).map(ortamGorunumu) })],
  ['/platform/giris-profilleri', (db, q) => ({
    profiller: girisProfilleriniListele(db, kimlikAl(q.get('projeId'), 'projeId')).map(girisProfiliGorunumu)
  })],
  ['/platform/baglam-profilleri', (db, q) => {
    const profiller = baglamProfilleriniListele(db, kimlikAl(q.get('projeId'), 'projeId'));
    return { profiller, turler: [...new Set(profiller.map((p) => p.tur))].sort((a, b) => a.localeCompare(b, 'tr')) };
  }],
  ['/platform/test-verisi-turleri', (db, q) => ({ turler: testVerisiTurleriniListele(db, kimlikAl(q.get('projeId'), 'projeId')) })],
  ['/platform/test-verisi-profilleri', (db, q) => ({
    profiller: testVerisiProfilleriniListele(db, kimlikAl(q.get('projeId'), 'projeId')).map(testVerisiProfiliGorunumu)
  })],
  ['/platform/gecmis', (db, q) => {
    const kayitlar = degisiklikGecmisiListele(db, metinAl(q.get('varlikTuru')), metinAl(q.get('varlikId')))
      .map((k) => ({ id: k.id, zaman: k.zaman, islem: k.islem, yapan: k.yapan, makineId: k.makineId, aciklama: k.aciklama }));
    // Makine adları şifrelidir; kasa açıkken arayüz "kullanici@<makineId>" değerini ada çevirir.
    return { kayitlar, makineler: Object.fromEntries(makineleriListele(db).map((m) => [m.id, m.ad])) };
  }],
  // Ayarlar > Koşu: tanımlar (form) + kayıtlı değerler.
  ['/platform/kosu-ayarlari', (db) => ({ ayarlar: kosuAyarlariniOku(db), tanimlar: KOSU_AYAR_TANIMLARI })],
  // Ekran rehberleri: ilk girişte otomatik açılsın mı (kullanıcı kararı) + görülenler (bkz. ayarlar/rehber-ayarlari.mjs).
  ['/platform/rehber', (db) => ({ rehber: rehberAyarlariniOku(db) })],
  // Ayarlar > Arayüz > Nöbetçi nasıl açılsın (kendi penceresi / varsayılan tarayıcı; başlatıcı okur, bkz. ayarlar/acilis-tercihi.mjs).
  ['/platform/acilis', () => ({ acilis: acilisTercihiniOku(VERI_KOKU) })],
  // Ayarlar > Güvenlik > Maskeleme: çekirdek gizli ad listesi (değiştirilemez) + kullanıcının ek adları.
  ['/platform/maskeleme', (db) => ({ cekirdek: CEKIRDEK_GIZLI_ADLAR, ekAdlar: ekGizliAdlar(db) })],
  // Ayarlar > Koşu > Hata sınıflandırma: kullanıcının kuralları + seçilebilen kategoriler.
  ['/platform/siniflandirma', (db) => ({ kurallar: siniflandirmaKurallari(db), kategoriler: KATEGORI_SECENEKLERI })],
  // Ayarlar > İzinler: durum (kayıt yoksa kapalı) + son değişiklikler (yapan makine adları kasada şifreli → eşleme).
  ['/platform/izinler', (db) => ({
    izinler: izinleriOku(db), degisiklikler: izinDegisiklikleri(db),
    makineler: Object.fromEntries(makineleriListele(db).map((m) => [m.id, m.ad]))
  })],
  ['/platform/guvenlik', (db) => ({
    otomatikKilitDakika, enAz: OTOMATIK_KILIT_EN_AZ_DK, enCok: OTOMATIK_KILIT_EN_COK_DK, varsayilan: OTOMATIK_KILIT_VARSAYILAN_DK,
    videoSaklamaGun: videoSaklamaGunu(db), videoSaklamaVarsayilan: VIDEO_SAKLAMA_VARSAYILAN_GUN,
    // Yasak adresler: ayarlardakiler (düzenlenir) + NOBETCI_YASAK_ADRESLER ortam değişkenindekiler (yalnızca gösterilir).
    yasakAdresler: ayarlardakiYasakAdresler(db), ortamYasakAdresleri: ortamdakiYasakAdresler(), yasakAdresEnCok: YASAK_ADRES_EN_COK
  })],
  // Tarih aralığı: baslangic / bitis (ISO) ya da geriye uyum için gun (son N gün) — sonuclar/aralik.mjs.
  ['/platform/sonuclar/ozet', (db, q) => sonucOzeti(db, kimlikAl(q.get('projeId'), 'projeId'), { urun: urunSecimi(q.get('urun')), ...sorgudanAralik(q) })],
  ['/platform/sonuclar/kosu', (db, q) => {
    const d = kosuDetayi(db, kimlikAl(q.get('id')));
    if (!d) throw new DepoHatasi('Koşu bulunamadı.');
    return kosuDetayiniMaskele(d, gosterimMaskesi(db, d.kosu.projeId));
  }],
  ['/platform/sonuclar/sonuc', (db, q) => {
    const d = sonucDetayi(db, kimlikAl(q.get('id')));
    if (!d) throw new DepoHatasi('Sonuç bulunamadı.');
    return { sonuc: sonucDetayiniMaskele(d, gosterimMaskesi(db, d.projeId)) };
  }],
  ['/platform/sonuclar/kaliplar', (db, q) => {
    const projeId = kimlikAl(q.get('projeId'), 'projeId');
    return hataKaliplariniMaskele(hataKaliplari(db, projeId, { urun: urunSecimi(q.get('urun')), ...sorgudanAralik(q) }), gosterimMaskesi(db, projeId));
  }],
  ['/platform/yedek/tahmin', (db) => yedekBoyutTahmini(db)],
  ['/platform/yedek/otomatik-liste', (db) => {
    const klasor = varsayilanYedekKlasoru(db);
    const dosyalar = existsSync(klasor)
      ? readdirSync(klasor).filter((ad) => ad.endsWith(YEDEK_UZANTISI)).map((ad) => {
        const s = statSync(join(klasor, ad));
        return { ad, boyut: s.size, zaman: s.mtime.toISOString(), otomatik: ad.startsWith('otomatik-') };
      }).sort((a, b) => b.zaman.localeCompare(a.zaman))
      : [];
    return { klasor, dosyalar };
  }]
]);
for (const [yol, islem] of SERVIS_GET_UCLARI) GET_UCLARI.set(yol, islem);
for (const [yol, islem] of TABLO_GET_UCLARI) GET_UCLARI.set(yol, islem);
// SQL adımları: veritabanı bağlantısı seçim listesi (sql/sorgu-bagdastirici.mjs).
for (const [yol, islem] of SQL_GET_UCLARI) GET_UCLARI.set(yol, islem);
for (const [yol, islem] of SQL_KULLANIM_GET_UCLARI) GET_UCLARI.set(yol, islem);
// Akış senaryoları (servis senaryosu türü "Akış"; servisler/akis-senaryosu.mjs).
for (const [yol, islem] of AKIS_SENARYO_GET_UCLARI) GET_UCLARI.set(yol, islem);
// Ayarlar > Entegrasyonlar (entegrasyonlar/uclar.mjs).
for (const [yol, islem] of ENTEGRASYON_GET_UCLARI) GET_UCLARI.set(yol, islem);
// Ayarlar > Koşu > Zamanlanmış koşular (zamanlama/uclar.mjs).
for (const [yol, islem] of zamanlamaGetUclari(zamanlayici)) GET_UCLARI.set(yol, islem);
// Zamanlanmış koşuların kilitliyken / açılışta çalışma tercihleri (A/B/C; görev durumu schtasks /Query ile).
GET_UCLARI.set('/platform/zamanlama/tercihler', (db) => arkaPlan.durum(db));
// Servis sonuçları ekranı (yalnız okuma): sonuclar/servis-sonuclari.mjs.
// Hata / kontrol metinleri gösterimde maskelenir (sonuclar/gosterim-maskesi.mjs; saklanan veri değişmez).
for (const [yol, islem] of SERVIS_SONUC_UCLARI) {
  GET_UCLARI.set(yol, (db, q) => servisSonucunuMaskele(yol, islem(db, q), gosterimMaskesi(db, q.get('projeId'))));
}
// Yan yana koşu karşılaştırması (yalnız okuma): sonuclar/karsilastirma.mjs.
for (const [yol, islem] of KARSILASTIRMA_UCLARI) GET_UCLARI.set(yol, islem);

/** @type {Map<string, (db: Veritabani, g: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>>} */
const POST_UCLARI = new Map([
  ['/platform/sayfa-paketi/onizle', (db, g) => paketOnizle(db, kimlikAl(g.projeId, 'projeId'), g.paket, {
    ekranId: secimliKimlik(g.ekranId) ?? null, mod: g.mod === 'analiz' ? 'analiz' : g.mod === 'degistir' ? 'degistir' : 'yeni'
  })],
  ['/platform/ekran/model/degistir', (db, g) => modeliPaketleDegistir(db, kimlikAl(g.projeId, 'projeId'), kimlikAl(g.ekranId, 'ekranId'), g.paket, {
    onay: g.onay === true, senaryoIndeksleri: g.senaryoIndeksleri, ortamIdleri: g.ortamIdleri, medyaKlasoru: medyaKlasoruYolu(), testVerisi: g.testVerisi
  })],
  ['/platform/sayfa-paketi/ekle', (db, g) => sayfaEkle(db, kimlikAl(g.projeId, 'projeId'), g.paket, {
    senaryoIndeksleri: g.senaryoIndeksleri, ortamIdleri: g.ortamIdleri, medyaKlasoru: medyaKlasoruYolu(), testVerisi: g.testVerisi
  })],
  ['/platform/ekran/analiz/yukle', (db, g) => analizYukle(db, kimlikAl(g.projeId, 'projeId'), kimlikAl(g.ekranId, 'ekranId'), g.paket, { medyaKlasoru: medyaKlasoruYolu(), testVerisi: g.testVerisi })],
  ['/platform/ekran/analiz/uygula', (db, g) => analizUygula(db, kimlikAl(g.projeId, 'projeId'), kimlikAl(g.ekranId, 'ekranId'), { analizId: g.analizId, kabul: g.kabul, red: g.red })],
  ['/platform/ekran/analiz/iptal', (db, g) => analizIptal(db, kimlikAl(g.projeId, 'projeId'), kimlikAl(g.ekranId, 'ekranId'), g.analizId)],
  ['/platform/ekran/akis/kaydet', (db, g) => akisKaydet(db, kimlikAl(g.projeId, 'projeId'), kimlikAl(g.ekranId, 'ekranId'), {
    akisId: typeof g.akisId === 'string' && g.akisId ? g.akisId : null, ad: g.ad, bloklar: g.bloklar, onay: g.onay === true
  })],
  ['/platform/ekran/akis/varsayilan', (db, g) => akisVarsayilanYap(db, kimlikAl(g.projeId, 'projeId'), kimlikAl(g.ekranId, 'ekranId'), String(g.akisId ?? ''))],
  ['/platform/ortak-akis/ekle', (db, g) => ortakAkisEkranlaraEkle(db, kimlikAl(g.projeId, 'projeId'), kimlikAl(g.ekranId, 'ekranId'), {
    ekranIdleri: g.ekranIdleri, istegeBagli: g.istegeBagli === true, onay: g.onay === true
  })],
  ['/platform/ekran/akis/sil', (db, g) => akisSil(db, kimlikAl(g.projeId, 'projeId'), kimlikAl(g.ekranId, 'ekranId'), String(g.akisId ?? ''))],
  ['/platform/ekran/reddedilenleri-unut', (db, g) => reddedilenleriUnut(db, kimlikAl(g.projeId, 'projeId'), kimlikAl(g.ekranId, 'ekranId'))],
  // Düz değer → tablo başvurusu: onay yoksa yalnız plan (hiçbir şey yazılmaz); onayla yalnız seçilen senaryo + alanlar.
  ['/platform/ekran/senaryolar/tablo-donusumu', (db, g) => ekranTabloDonusumu(db, kimlikAl(g.projeId, 'projeId'), {
    ekranId: secimliKimlik(g.ekranId) ?? null, onay: g.onay === true, secimler: g.secimler
  }, { kosuyorMu })],
  ['/platform/ekran/toplu-ata', (db, g) => topluDegerAta(db, kimlikAl(g.projeId, 'projeId'), kimlikAl(g.ekranId, 'ekranId'), { anahtar: g.anahtar, deger: g.deger, senaryoIdler: g.senaryoIdler })],
  ['/platform/ekran/claude-dosyasi', (db, g) => {
    const s = claudeDosyasiYaz(db, kimlikAl(g.projeId, 'projeId'), kimlikAl(g.ekranId, 'ekranId'), {
      tur: g.tur, baglamProfilleri: g.baglamProfilleri, bulguId: g.bulguId, klasor: analizKlasoruYolu(), projeKoku: PROJE_KOKU
    });
    console.log(`[platform] Claude analiz dosyası yazıldı: ${s.yol}`);
    return { yol: s.yol, cumle: s.cumle };
  }],
  // Ekran yönetimi (Ekranlar > ⋯; bkz. ekranlar/ekran-yonetimi.mjs). Her işlem degisiklik_gecmisi'ne yazılır.
  ['/platform/ekran/yeniden-adlandir', (db, g) => ekranYenidenAdlandir(db, kimlikAl(g.projeId, 'projeId'), kimlikAl(g.ekranId, 'ekranId'), { ad: g.ad, aciklama: g.aciklama })],
  ['/platform/ekran/duzenle', (db, g) => ekranDuzenle(db, kimlikAl(g.projeId, 'projeId'), kimlikAl(g.ekranId, 'ekranId'), { urlYolu: g.urlYolu })],
  ['/platform/ekran/sirala', (db, g) => {
    if (!Array.isArray(g.idler) || g.idler.length > 1000) throw new DepoHatasi('"idler" bir kimlik dizisi olmalıdır.');
    return ekranlariSirala(db, kimlikAl(g.projeId, 'projeId'), g.idler.map((x) => kimlikAl(x, 'idler')));
  }],
  ['/platform/ekran/durum', (db, g) => {
    if (typeof g.etkin !== 'boolean') throw new DepoHatasi('"etkin" true ya da false olmalıdır.');
    const sonuc = ekranDurumunuAyarla(db, kimlikAl(g.projeId, 'projeId'), kimlikAl(g.ekranId, 'ekranId'), g.etkin);
    if (sonuc.degisti) console.log(`[platform] Ekran ${g.etkin ? 'etkinleştirildi' : 'devre dışı bırakıldı'}.`);
    return sonuc;
  }],
  ['/platform/ekran/geri-yukle', (db, g) => {
    const sonuc = ekranGeriYukle(db, kimlikAl(g.projeId, 'projeId'), kimlikAl(g.ekranId, 'ekranId'));
    console.log('[platform] Silinmiş ekran geri yüklendi.');
    return sonuc;
  }],
  // KURU ÇALIŞTIRMA: silinecek sayılar (hiçbir şey değişmez).
  ['/platform/ekran/sil/onizle', (db, g) => ({ onizleme: ekranSilmeOnizlemesi(db, kimlikAl(g.projeId, 'projeId'), kimlikAl(g.ekranId, 'ekranId')) })],
  ['/platform/ekran/sil', (db, g) => {
    if (g.sonuclariSil !== undefined && typeof g.sonuclariSil !== 'boolean') throw new DepoHatasi('"sonuclariSil" true ya da false olmalıdır.');
    const sonuc = ekranSil(db, kimlikAl(g.projeId, 'projeId'), kimlikAl(g.ekranId, 'ekranId'), {
      onayAdi: g.onayAdi, sonuclariSil: g.sonuclariSil === true, medyaKlasoru: medyaKlasoruYolu(), kosuyorMu
    });
    console.log(`[platform] Ekran silindi (${sonuc.silinen.senaryo} senaryo, ${sonuc.silinen.modelSurumu} model sürümü, ${sonuc.silinen.sonuc} sonuç${sonuc.mezarTasi ? '; mezar taşı kaldı' : ''}).`);
    return sonuc;
  }],
  ['/platform/senaryo/kaydet', (db, g) => {
    const projeId = kimlikAl(g.projeId, 'projeId');
    const sonuc = senaryoKaydet(db, {
      id: secimliKimlik(g.id) ?? null, projeId, ekranId: secimliKimlik(g.ekranId) ?? null, baslik: g.baslik,
      ...(g.veri !== undefined ? { veri: g.veri } : {}), ortamIdleri: g.ortamIdleri, kosuyaDahil: g.kosuyaDahil, mutlakaGorunmeli: g.mutlakaGorunmeli,
      ...(typeof g.akisId === 'string' ? { akisId: g.akisId } : {}),
      // Giriş seçimi (senaryo-girisi.mjs): verilmezse mevcut korunur.
      ...(g.giris !== undefined ? { giris: g.giris } : {}),
      // Satır seçimleri (${Tablo.Sütun} değerlerinin koşuda kullanılacak satırı): verilmezse mevcut korunur.
      ...(g.tabloSecimleri !== undefined ? { tabloSecimleri: g.tabloSecimleri } : {})
    }, { kosuyorMu });
    // Formda yüklenen (henüz sahipsiz) şifreli dosyalar bu senaryoya bağlanır (sahipsiz temizliği silmesin).
    if (g.veri !== undefined) dosyaSahipleriniBagla(db, 'senaryo', sonuc.id, g.veri);
    return { id: sonuc.id, uyarilar: sonuc.uyarilar };
  }],
  // Senaryoların değişiklik geçmişini siler (geri alınamaz; onay: true olmadan yalnızca sayar).
  ['/platform/senaryo/gecmis/sil', (db, g) => senaryoGecmisiniSil(db, kimlikAl(g.projeId, 'projeId'), g.idler, { onay: g.onay === true })],
  // ortamId verilirse yalnız o ortamda; verilmezse senaryonun tanımlı olduğu tüm ortamlarda.
  ['/platform/senaryo/kosuya-dahil', (db, g) => kosuyaDahilAyarla(db, kimlikAl(g.projeId, 'projeId'), g.idler, g.dahil === true, undefined,
    g.ortamId === undefined || g.ortamId === null ? null : kimlikAl(g.ortamId, 'ortamId'))],
  ['/platform/senaryo/sil', (db, g) => senaryolariSil(db, kimlikAl(g.projeId, 'projeId'), g.idler, { kosuyorMu })],
  ['/platform/senaryo/kopyala', (db, g) => senaryoKopyala(db, kimlikAl(g.projeId, 'projeId'), kimlikAl(g.id))],
  // Toplu çoğaltma: onaysız çağrı önizleme döner (hiçbir şey yazılmaz).
  ['/platform/senaryolar/cogalt', (db, g) => senaryolariCogalt(db, kimlikAl(g.projeId, 'projeId'), { idler: g.idler, adet: g.adet, sablon: g.sablon, onay: g.onay === true })],
  ['/platform/kosu-ayarlari/kaydet', (db, g) => ({ ayarlar: kosuAyarlariniKaydet(db, g.ayarlar) })],
  ['/platform/acilis/kaydet', (db, g) => ({ acilis: acilisTercihiniKaydet(VERI_KOKU, g.bicim) })],
  ['/platform/rehber/kaydet', (db, g) => ({ rehber: rehberAyarlariniKaydet(db, { otomatik: g.otomatik, gorulen: g.gorulen, sifirla: g.sifirla }) })],
  ['/platform/maskeleme/kaydet', (db, g) => ({ ekAdlar: ekGizliAdlariKaydet(db, g.ekAdlar) })],
  ['/platform/siniflandirma/kaydet', (db, g) => ({ kurallar: siniflandirmaKurallariniKaydet(db, g.kurallar) })],
  // Sonuçlar > Geçmiş sonuçları sil: tümü ya da "gun" günden eski bitmiş koşular (sonuç, adım, ekran görüntüsü, video, iz) ile
  // servis / akış koşuları. onay: true olmadan yalnızca sayar. Şifreli medya dosyaları hemen silinir. Geri alınamaz.
  ['/platform/sonuclar/temizle', (db, g) => {
    const tumu = g.tumu === true;
    const gun = Number(g.gun);
    if (!tumu && (!Number.isInteger(gun) || gun < 1 || gun > 3650)) throw new DepoHatasi('"gun" 1–3650 arasında bir tam sayı olmalıdır (ya da "tumu": true).');
    const esik = new Date(tumu ? Date.now() + 86_400_000 : Date.now() - gun * 86_400_000).toISOString();
    if (g.onay !== true) {
      const say = (/** @type {string} */ sql) => Number(db.tek(sql, [esik])?.n ?? 0);
      return { onizleme: {
        kosu: say("SELECT COUNT(*) AS n FROM kosular WHERE baslangic < ? AND durum != 'calisiyor'"),
        sonuc: say("SELECT COUNT(*) AS n FROM kosu_sonuclari WHERE kosu_id IN (SELECT id FROM kosular WHERE baslangic < ? AND durum != 'calisiyor')"),
        medya: say("SELECT COUNT(*) AS n FROM medya WHERE sonuc_id IN (SELECT r.id FROM kosu_sonuclari r JOIN kosular k ON k.id = r.kosu_id WHERE k.baslangic < ? AND k.durum != 'calisiyor')"),
        servisKosusu: say('SELECT COUNT(*) AS n FROM servis_kosulari WHERE baslangic < ?'),
        akisKosusu: say('SELECT COUNT(*) AS n FROM servis_akis_kosulari WHERE baslangic < ?')
      } };
    }
    const r = eskiSonuclariSil(db, tumu ? 0 : gun, { tumu });
    for (const dosya of r.medyaDosyalari) medyaDosyasiniSil(medyaKlasoruYolu(), dosya);
    console.log(`[platform] Geçmiş sonuçlar silindi: ${r.kosu} koşu, ${r.sonuc} sonuç, ${r.medyaDosyalari.length} medya dosyası, ${r.servisKosusu} servis ve ${r.akisKosusu} akış koşusu.`);
    return { silinen: { kosu: r.kosu, sonuc: r.sonuc, medya: r.medyaDosyalari.length, servisKosusu: r.servisKosusu, akisKosusu: r.akisKosusu } };
  }],
  // Ayarlar > İzinler: aç (onay: true — arayüz "ne yapar / riski" penceresinde onaylatır) / kapat (serbest). Geçmişe yazılır.
  ['/platform/izin/degistir', (db, g) => {
    const r = izinDegistir(db, g.anahtar, g.acik, { onay: g.onay });
    if (r.degisti) console.log(`[platform] İzin ${g.acik === true ? 'açıldı' : 'kapatıldı'}: ${String(g.anahtar)}.`);
    return { izinler: r.izinler, degisiklikler: izinDegisiklikleri(db) };
  }],
  ['/platform/guvenlik/kaydet', (db, g) => {
    /** @type {Record<string, unknown>} */
    const yanit = {};
    if (g.otomatikKilitDakika !== undefined) {
      const dk = Number(g.otomatikKilitDakika);
      if (!Number.isInteger(dk) || dk < OTOMATIK_KILIT_EN_AZ_DK || dk > OTOMATIK_KILIT_EN_COK_DK) {
        throw new DepoHatasi(`Otomatik kilit süresi ${OTOMATIK_KILIT_EN_AZ_DK}–${OTOMATIK_KILIT_EN_COK_DK} dakika arasında bir tam sayı olmalıdır.`);
      }
      const mevcut = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(db, GUVENLIK_AYAR_ANAHTARI));
      ayarYaz(db, GUVENLIK_AYAR_ANAHTARI, { ...(mevcut ?? {}), otomatikKilitDakika: dk });
      otomatikKilitDakika = dk;
      yanit.otomatikKilitDakika = dk;
    }
    if (g.videoSaklamaGun !== undefined) {
      const gun = Number(g.videoSaklamaGun);
      if (!Number.isInteger(gun) || gun < 1 || gun > 365) throw new DepoHatasi('Video saklama süresi 1–365 gün arasında bir tam sayı olmalıdır.');
      const mevcut = /** @type {Record<string, unknown> | undefined} */ (ayarGetir(db, MEDYA_AYAR_ANAHTARI));
      ayarYaz(db, MEDYA_AYAR_ANAHTARI, { ...(mevcut ?? {}), videoSaklamaGun: gun });
      yanit.videoSaklamaGun = gun;
    }
    if (g.yasakAdresler !== undefined) {
      yanit.yasakAdresler = yasakAdresleriKaydet(db, g.yasakAdresler);
      console.log(`[platform] Yasak adres listesi güncellendi (${/** @type {string[]} */ (yanit.yasakAdresler).length} kalıp).`);
    }
    return yanit;
  }],
  ['/platform/proje/kaydet', (db, g) => {
    const aciklama = metinAl(g.aciklama).trim();
    const mevcutId = secimliKimlik(g.id);
    const mevcut = mevcutId ? projeGetir(db, mevcutId) : undefined;
    if (mevcutId && !mevcut) throw new DepoHatasi('Proje bulunamadı.');
    const ad = metinAl(g.ad).replace(/\s+/g, ' ').trim();
    if (!ad) throw new DepoHatasi('Proje adı boş olamaz.');
    if (projeleriListele(db).some((p) => p.id !== mevcutId && p.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr'))) {
      throw new DepoHatasi('Bu çalışma alanında bu adla bir proje zaten var.');
    }
    // Açıklama gönderilmezse (ör. yalnızca yeniden adlandırma) mevcut açıklama korunur.
    const id = projeKaydet(db, { id: mevcutId, ad, aciklama: g.aciklama === undefined ? (mevcut?.aciklama ?? null) : aciklama || null });
    projeSayisiniKaydet(db);
    return { proje: projeGetir(db, id) };
  }],
  // Proje ⋯: varsayılan yap · sil (önce KURU ÇALIŞTIRMA sayıları; onay: proje adı birebir; silmeden önce otomatik yedek
  // alınır ve mevcut yedeklere dokunulmaz). Koşu/tarama sürerken silinemez.
  ['/platform/proje/varsayilan', (db, g) => ({ varsayilanId: varsayilanProjeAyarla(db, kimlikAl(g.id)) })],
  ['/platform/proje/sil/onizle', (db, g) => ({ onizleme: projeSilmeOnizlemesi(db, kimlikAl(g.id)) })],
  ['/platform/proje/sil', (db, g) => {
    if (kosucu?.mesgulMu?.()) throw new DepoHatasi('Bir test koşusu sürüyor; proje koşu bitince silinebilir.');
    if (taramaSuruyorMu()) throw new DepoHatasi('Bir ekran taraması sürüyor; proje tarama bitince silinebilir.');
    const onizleme = projeSilmeOnizlemesi(db, kimlikAl(g.id));
    if (typeof g.onayAdi !== 'string' || g.onayAdi.replace(/\s+/g, ' ').trim() !== onizleme.proje.ad) {
      throw new DepoHatasi('Onay için projenin adını birebir yazın.');
    }
    // Mevcut yedeklere dokunulmaz (bu yedek alınırken eski otomatik yedekler budanmaz).
    const yedek = otomatikYedekAl(db, { saklanacak: Number.MAX_SAFE_INTEGER });
    const sonuc = projeyiSil(db, onizleme.proje.id, { medyaKlasoru: medyaKlasoruYolu() });
    projeSayisiniKaydet(db);
    console.log(`[platform] Proje silindi (${sonuc.silinen.senaryo} senaryo, ${sonuc.silinen.kosu} koşu, ${sonuc.silinen.medyaDosyasi} medya dosyası); önce yedek alındı.`);
    return { ...sonuc, yedek: { dosya: yedek.dosya } };
  }],
  ['/platform/ortam/kaydet', (db, g) => {
    const mevcutId = secimliKimlik(g.id);
    // "canli": ortam CANLI (üretim) ortamıdır → "Akışı kaydet" bu ortamda başlatılamaz (ayarlar.canli; diğer ayarlar korunur).
    const mevcutAyarlar = mevcutId ? ortamGetir(db, mevcutId)?.ayarlar : undefined;
    const ayarlar = typeof g.canli === 'boolean' ? { ...(mevcutAyarlar ?? {}), canli: g.canli } : undefined;
    const id = ortamKaydet(db, {
      id: mevcutId, projeId: kimlikAl(g.projeId, 'projeId'), ad: metinAl(g.ad), tabanUrl: metinAl(g.tabanUrl).trim(),
      varsayilan: g.varsayilan === true, ...(ayarlar ? { ayarlar } : {})
    });
    return { ortam: ortamGorunumu(/** @type {import('./veritabani/depo.mjs').Ortam} */ (ortamGetir(db, id))) };
  }],
  ['/platform/ortam/sil', (db, g) => ({ silindi: ortamSil(db, kimlikAl(g.id)) })],
  ['/platform/giris-profili/kaydet', (db, g) => {
    const id = secimliKimlik(g.id);
    const mevcut = id ? girisProfiliGetir(db, id) : undefined;
    const tur = g.ikiAsamaliTur === 'totp' || g.ikiAsamaliTur === 'sms' ? g.ikiAsamaliTur : 'yok';
    const ortamId = secimliKimlik(g.ortamId) ?? null;
    if (ortamId && !ortamGetir(db, ortamId)) throw new DepoHatasi('Seçilen ortam bulunamadı.');
    /** @type {Record<string, unknown>} */
    let smsAyari = {};
    if (tur === 'sms') {
      const sms = /** @type {Record<string, unknown>} */ (typeof g.sms === 'object' && g.sms !== null ? g.sms : {});
      if (sms.yontem === 'elle') smsAyari = { yontem: 'elle' };
      else {
        const kod = metinAl(sms.kod).trim();
        if (!kod) throw new DepoHatasi('Sabit SMS test kodu boş olamaz (ya da "koşu sırasında elle girilir" seçin).');
        smsAyari = { yontem: 'sabit', kod };
      }
    }
    const kayitId = girisProfiliKaydet(db, {
      id, projeId: kimlikAl(g.projeId, 'projeId'), ortamId, ad: metinAl(g.ad), kullaniciAdi: metinAl(g.kullaniciAdi),
      // Boş/gönderilmemiş = mevcut değeri koru; parolaSil: true = kaldır.
      parola: g.parolaSil === true ? null : secimliMetin(g.parola),
      ikiAsamaliTur: tur,
      totpGizli: tur === 'totp' ? secimliMetin(g.totpGizli) ?? (mevcut?.totpGizliVar ? undefined : null) : null,
      smsAyari,
      // Ek alanlar: verilmezse mevcutlar korunur; gizli alanda "deger" gönderilmezse kayıtlı değer korunur.
      ekAlanlar: Array.isArray(g.ekAlanlar)
        ? g.ekAlanlar.map((/** @type {any} */ e) => ({
          ad: metinAl(e?.ad), gizli: e?.gizli === true,
          deger: e?.gizli === true ? (typeof e?.deger === 'string' && e.deger !== '' ? e.deger : e?.sil === true ? null : undefined) : metinAl(e?.deger)
        }))
        : undefined
    });
    return { profil: girisProfiliGorunumu(/** @type {import('./veritabani/depo.mjs').GirisProfili} */ (girisProfiliGetir(db, kayitId))) };
  }],
  ['/platform/giris-profili/sil', (db, g) => ({ silindi: girisProfiliSil(db, kimlikAl(g.id)) })],
  ['/platform/giris-tarifi/kaydet', (db, g) => {
    const projeId = kimlikAl(g.projeId, 'projeId');
    const ortamId = kimlikAl(g.ortamId, 'ortamId');
    girisTarifiKaydet(db, projeId, ortamId, g.tarif);
    return { tarif: girisTarifiGorunumu(db, projeId, /** @type {import('./veritabani/depo.mjs').Ortam} */ (ortamGetir(db, ortamId))) };
  }],
  ['/platform/giris-tarifi/dogrula', (_db, g) => {
    const d = girisTarifiniDogrula(g.tarif);
    return { gecerli: d.gecerli, hatalar: d.hatalar };
  }],
  ['/platform/giris-tarifi/sifirla', (db, g) => {
    const projeId = kimlikAl(g.projeId, 'projeId');
    const ortamId = kimlikAl(g.ortamId, 'ortamId');
    const kaldirildi = girisTarifiniSifirla(db, projeId, ortamId);
    return { kaldirildi, tarif: girisTarifiGorunumu(db, projeId, /** @type {import('./veritabani/depo.mjs').Ortam} */ (ortamGetir(db, ortamId))) };
  }],
  ['/platform/giris-profili/goster', (db, g) => {
    const p = girisProfiliGetir(db, kimlikAl(g.id), { coz: true });
    if (!p) throw new DepoHatasi('Giriş profili bulunamadı.');
    if (g.alan === 'parola') return { deger: p.parola ?? '' };
    if (g.alan === 'totpGizli') return { deger: p.totpGizli ?? '' };
    // Gizli ek alan: "ek:<ad>".
    if (typeof g.alan === 'string' && g.alan.startsWith('ek:')) {
      const e = p.ekAlanlar.find((x) => x.ad === /** @type {string} */ (g.alan).slice(3));
      if (!e) throw new DepoHatasi('Ek alan bulunamadı.');
      return { deger: e.deger ?? '' };
    }
    throw new DepoHatasi('"alan" yalnızca parola, totpGizli veya ek:<ad> olabilir.');
  }],
  ['/platform/baglam-profili/kaydet', (db, g) => {
    const alanlar = typeof g.alanlar === 'object' && g.alanlar !== null && !Array.isArray(g.alanlar) ? g.alanlar : {};
    const id = baglamProfiliKaydet(db, {
      id: secimliKimlik(g.id), projeId: kimlikAl(g.projeId, 'projeId'), tur: metinAl(g.tur), ad: metinAl(g.ad),
      alanlar: /** @type {Record<string, unknown>} */ (alanlar), ortamId: ortamSecimi(g.ortamId)
    });
    return { id };
  }],
  ['/platform/baglam-profili/sil', (db, g) => ({ silindi: baglamProfiliSil(db, kimlikAl(g.id)) })],
  ['/platform/test-verisi-turu/kaydet', (db, g) => {
    if (!Array.isArray(g.alanlar)) throw new DepoHatasi('"alanlar" bir dizi olmalıdır.');
    const id = testVerisiTuruKaydet(db, { id: secimliKimlik(g.id), projeId: kimlikAl(g.projeId, 'projeId'), ad: metinAl(g.ad), alanlar: g.alanlar });
    return { id };
  }],
  ['/platform/test-verisi-turu/sil', (db, g) => ({ silindi: testVerisiTuruSil(db, kimlikAl(g.id)) })],
  ['/platform/test-verisi-profili/kaydet', (db, g) => {
    const degerler = typeof g.degerler === 'object' && g.degerler !== null && !Array.isArray(g.degerler) ? g.degerler : {};
    const id = testVerisiProfiliKaydet(db, {
      id: secimliKimlik(g.id), projeId: kimlikAl(g.projeId, 'projeId'), turId: kimlikAl(g.turId, 'turId'), ad: metinAl(g.ad),
      degerler: /** @type {Record<string, string | number | boolean | null>} */ (degerler), ortamId: ortamSecimi(g.ortamId)
    });
    return { profil: testVerisiProfiliGorunumu(/** @type {import('./veritabani/depo.mjs').TestVerisiProfili} */ (testVerisiProfiliGetir(db, id))) };
  }],
  ['/platform/test-verisi-profili/sil', (db, g) => ({ silindi: testVerisiProfiliSil(db, kimlikAl(g.id)) })],
  ['/platform/test-verisi-profili/goster', (db, g) => {
    const p = testVerisiProfiliGetir(db, kimlikAl(g.id), { coz: true });
    if (!p) throw new DepoHatasi('Test verisi profili bulunamadı.');
    const alan = metinAl(g.alan);
    if (!p.hassasAlanlar.includes(alan)) throw new DepoHatasi('Bu alan hassas bir alan değil.');
    const deger = p.degerler[alan];
    return { deger: deger === null || deger === undefined ? '' : String(deger) };
  }]
]);
// Servis testleri (servisler/servis-uclari.mjs): ekran uçlarından ayrı; aynı belirteç / kasa kuralları.
for (const [yol, islem] of SERVIS_POST_UCLARI) POST_UCLARI.set(yol, islem);
for (const [yol, islem] of AKIS_SENARYO_POST_UCLARI) POST_UCLARI.set(yol, islem);
// Test verisi tabloları (tablolar/tablo-uclari.mjs).
for (const [yol, islem] of TABLO_POST_UCLARI) POST_UCLARI.set(yol, islem);
// Ayarlar > Entegrasyonlar (entegrasyonlar/uclar.mjs).
for (const [yol, islem] of entegrasyonPostUclari({ medyaKlasoruYolu })) POST_UCLARI.set(yol, islem);
for (const [yol, islem] of SQL_KULLANIM_POST_UCLARI) POST_UCLARI.set(yol, islem);
// Ayarlar > Koşu > Zamanlanmış koşular (zamanlama/uclar.mjs; hiçbir uç koşu başlatmaz).
for (const [yol, islem] of ZAMANLAMA_POST_UCLARI) POST_UCLARI.set(yol, islem);
POST_UCLARI.set('/platform/zamanlama/tercih', (db, g) => arkaPlan.tercihDegistir(db, g));
/** İzin denetimine tabi uçlar (izin-tanimlari.mjs > islemler[].uclar). */
const IZIN_DENETIMLI_UCLAR = denetlenenUclar();

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{ token: string; raporlayiciTokeni?: string; jsonGonder: (res: import('node:http').ServerResponse, durum: number, govde: unknown) => void }} baglam
 *   raporlayiciTokeni: YALNIZCA /platform/sonuc/* (raporlayıcı yazma) uçlarında oturum token'ına ek olarak kabul edilir.
 * @returns {Promise<boolean>} istek bir /platform uç noktasıyla eşleştiyse true
 */
export async function platformIsteginiIsle(req, res, baglam) {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const yol = url.pathname;
  if (!yol.startsWith('/platform/')) return false;
  const { jsonGonder } = baglam;
  const baslikToken = req.headers['x-test-sunucu-token'];
  const disTokenGecerli = (typeof baslikToken === 'string' && baslikToken === baglam.token) || url.searchParams.get('token') === baglam.token;

  /** @returns {Promise<Record<string, unknown> | null>} */
  const jsonGovde = async (sinir = JSON_GOVDE_SINIRI) => {
    let metin;
    try {
      metin = (await ikiliGovdeOku(req, sinir)).toString('utf8');
    } catch (hata) {
      const cokBuyuk = Boolean(/** @type {{ cokBuyuk?: boolean }} */ (hata).cokBuyuk);
      if (cokBuyuk) res.setHeader('Connection', 'close');
      jsonGonder(res, cokBuyuk ? 413 : 400, {
        basarili: false,
        mesaj: cokBuyuk
          ? (sinir >= 1024 * 1024 ? `İstek gövdesi en fazla ${sinir / 1024 / 1024} MB olabilir.` : `İstek gövdesi en fazla ${sinir / 1024} KB olabilir.`)
          : 'İstek gövdesi okunamadı.'
      });
      return null;
    }
    try {
      const govde = metin ? JSON.parse(metin) : {};
      if (typeof govde !== 'object' || govde === null || Array.isArray(govde)) throw new Error('nesne değil');
      return govde;
    } catch {
      jsonGonder(res, 400, { basarili: false, mesaj: 'Geçersiz istek gövdesi (JSON nesnesi bekleniyor).' });
      return null;
    }
  };
  const tokenYok = () => jsonGonder(res, 401, { basarili: false, mesaj: 'Geçersiz token.' });
  // Kimliği doğrulanmış her istek (durum sorgusu hariç) otomatik kilit sayacını sıfırlar.
  if (disTokenGecerli && yol !== '/platform/durum') platformEtkinligiBildir();

  // Arka plan kipi (kullanıcı tercihiyle kasa kilitliyken zamanlanmış koşu için anahtar bellekte): arayüz KİLİTLİDİR. Varsayılan
  // reddet — yalnız durum, kasayı açma/kilitleme, çalışma alanı seçimi ve raporlayıcının yazma uçları geçer; diğer her uç 423.
  if (vt && arkaPlanKipindeMi(vt) && !arayuzKilidindeIzinliMi(req.method ?? '', yol)) {
    req.resume();
    jsonGonder(res, 423, { basarili: false, kod: 'KASA_KILITLI', mesaj: 'Kasa kilitli. Önce kasa parolasıyla kasayı açın.' });
    return true;
  }

  try {
    // --- GET /platform/durum (kasa kilitliyken de çalışır; YALNIZCA gizli olmayan bilgi) -----
    if (req.method === 'GET' && yol === '/platform/durum') {
      if (!disTokenGecerli) { tokenYok(); return true; }
      const db = await platformVeritabani();
      const ozet = db ? platformDurumOzeti(db) : null;
      jsonGonder(res, 200, {
        basarili: true,
        veritabaniVar: Boolean(db),
        veritabaniYolu: veritabaniYolu(),
        semaSurumu: ozet?.semaSurumu ?? 0,
        desteklenenSemaSurumu: GUNCEL_SEMA_SURUMU,
        makineId: ozet?.makineId ?? null,
        kasa: ozet?.kasa ?? { olusturuldu: false, acik: false, minParolaUzunlugu: MIN_PAROLA_UZUNLUGU, kdf: null },
        sifreliAlanGocu: ozet?.sifreliAlanGocu ?? 'tamam',
        sayimlar: ozet?.sayimlar ?? {},
        parolaBeklemeSaniye: Math.ceil(denemeSiniri.kalanMs() / 1000),
        aktifIceAktarma: iceAktarma.aktifIs(),
        otomatikKilit: { dakika: otomatikKilitDakika, sonKilitlenme: otomatikKilitZamani },
        // Açık çalışma alanı (yalnızca görünen ad; seçim ekranında da görünür) ve son dışa aktarımdan beri değişiklik.
        calismaAlani: aktifAlan ? { id: aktifAlan.id, ad: aktifAlan.ad, sabit: aktifAlan.sabit } : null,
        degisiklik: db ? degisiklikDurumu(db) : null,
        // Zamanlanmış koşular (gizli olmayan): anahtar zamanlayıcı için bellekte mi, DPAPI dosyası var mı, kilit menüsü iki seçenekli mi.
        zamanlama: arkaPlan.kilitDurumu(db)
      });
      return true;
    }

    // --- Çalışma alanları (kasa GEREKMEZ; gizli bilgi yok) ---------------------------------------------
    //   GET  /platform/calisma-alanlari                     seçim ekranı listesi
    //   POST /platform/calisma-alani/olustur { ad }         yeni (boş) çalışma alanı oluşturulur ve açılır
    //   POST /platform/calisma-alani/ac { id, parola }      çalışma alanının kasa parolasıyla açılır (değiştirir)
    //   POST /platform/calisma-alani/kapat {}               açık çalışma alanı kapatılır (iş sürüyorsa 409 MESGUL)
    //   POST /platform/calisma-alani/yeniden-adlandir { id, ad }
    //   POST /platform/calisma-alani/kaldir { id, onayAdi } bu bilgisayardan kaldırır (açık olan kaldırılamaz)
    if (req.method === 'GET' && yol === '/platform/calisma-alanlari') {
      if (!disTokenGecerli) { tokenYok(); return true; }
      res.setHeader('Cache-Control', 'no-store');
      jsonGonder(res, 200, { basarili: true, ...calismaAlaniListesi() });
      return true;
    }
    const alanEslesme = req.method === 'POST' ? /^\/platform\/calisma-alani\/(olustur|ac|kapat|yeniden-adlandir|kaldir)$/.exec(yol) : null;
    if (alanEslesme) {
      const g = await jsonGovde();
      if (!g) return true;
      if (g.token !== baglam.token && !disTokenGecerli) { tokenYok(); return true; }
      platformCalismaAlanlariniHazirla();
      const alanKimligi = () => (typeof g.id === 'string' && /^[a-z0-9]{1,40}$/.test(g.id) ? g.id : (() => { throw new CalismaAlaniHatasi('GECERSIZ', '"id" geçersiz.'); })());
      switch (alanEslesme[1]) {
        case 'olustur': {
          if (aktifAlan?.sabit) throw new CalismaAlaniHatasi('SABIT', 'Bu sunucu tek bir veritabanıyla (PLATFORM_VERITABANI) başlatıldı; yeni çalışma alanı oluşturulamaz.');
          mesgulDegilOlmali();
          const alan = alanOlustur(VERI_KOKU, g.ad);
          try {
            alaniKapat({ sonAcilaniUnut: true });
          } catch (hata) {
            try { alanKaldir(VERI_KOKU, alan.id, alan.ad); } catch { /* yok sayılır */ }
            throw hata;
          }
          aktifAlan = { id: alan.id, ad: alan.ad, veritabani: alanYollari(VERI_KOKU, alan).veritabani, sabit: false };
          console.log('[platform] Yeni çalışma alanı oluşturuldu.');
          jsonGonder(res, 200, { basarili: true, calismaAlani: { id: alan.id, ad: alan.ad } });
          return true;
        }
        case 'ac': {
          const acilan = await alaniAc(alanKimligi(), metinAl(g.parola));
          jsonGonder(res, 200, { basarili: true, calismaAlani: acilan });
          return true;
        }
        case 'kapat':
          alaniKapat({ sonAcilaniUnut: true });
          jsonGonder(res, 200, { basarili: true });
          return true;
        case 'yeniden-adlandir': {
          if (aktifAlan?.sabit) throw new CalismaAlaniHatasi('SABIT', 'Bu sunucu tek bir veritabanıyla (PLATFORM_VERITABANI) başlatıldı.');
          const alan = alanYenidenAdlandir(VERI_KOKU, alanKimligi(), g.ad);
          if (aktifAlan?.id === alan.id) aktifAlan.ad = alan.ad;
          jsonGonder(res, 200, { basarili: true, calismaAlani: { id: alan.id, ad: alan.ad } });
          return true;
        }
        default: {
          const id = alanKimligi();
          if (aktifAlan?.id === id) throw new CalismaAlaniHatasi('ACIK', 'Açık çalışma alanı kaldırılamaz. Önce kapatın (sağ üst menü > Çalışma alanını kapat).');
          const kaldirilan = kayitDefteriniHazirla(VERI_KOKU).defter.alanlar.find((a) => a.id === id);
          const sonuc = alanKaldir(VERI_KOKU, id, g.onayAdi);
          // Windows oturumuna bağlı otomatik açma dosyası (veritabanının yanında) da silinir.
          if (kaldirilan) { try { arkaPlan.alanKaldirildi(alanYollari(VERI_KOKU, kaldirilan).veritabani); } catch { /* yok sayılır */ } }
          denemeSinirlari.delete(id);
          console.log(`[platform] Çalışma alanı bu bilgisayardan kaldırıldı (${sonuc.silinenDosya} dosya silindi).`);
          jsonGonder(res, 200, { basarili: true, silinenDosya: sonuc.silinenDosya });
          return true;
        }
      }
    }

    // --- GET /platform/yedek/ice-aktar/<id> — ilerleme + (hazırsa) önizleme ------------------
    const isEslesme = /^\/platform\/yedek\/ice-aktar\/([a-f0-9]{16})(?:\/(uygula|iptal))?$/.exec(yol);
    if (req.method === 'GET' && isEslesme && !isEslesme[2]) {
      if (!disTokenGecerli) { tokenYok(); return true; }
      const is = iceAktarma.durum(isEslesme[1]);
      if (!is) { jsonGonder(res, 404, { basarili: false, kod: 'BULUNAMADI', mesaj: 'İçe aktarma bulunamadı (süresi dolmuş veya iptal edilmiş olabilir).' }); return true; }
      jsonGonder(res, 200, { basarili: is.durum !== 'hata', is });
      return true;
    }

    // --- GET /platform/yedek/disa-aktar/<id>[/indir] — dışa aktarma ilerlemesi / indirme ------
    const disaEslesme = /^\/platform\/yedek\/disa-aktar\/([a-f0-9]{16})(\/indir)?$/.exec(yol);
    if (req.method === 'GET' && disaEslesme) {
      if (!disTokenGecerli) { tokenYok(); return true; }
      disaAktarmaTemizle();
      const is = disaAktarmaIsleri.get(disaEslesme[1]);
      if (!is) { jsonGonder(res, 404, { basarili: false, kod: 'BULUNAMADI', mesaj: 'Dışa aktarma bulunamadı (süresi dolmuş veya indirilmiş olabilir).' }); return true; }
      if (!disaEslesme[2]) {
        res.setHeader('Cache-Control', 'no-store');
        jsonGonder(res, 200, { basarili: is.durum !== 'hata', is: disaAktarmaGorunumu(is) });
        return true;
      }
      if (is.durum !== 'hazir' || !existsSync(is.dosya)) { jsonGonder(res, 409, { basarili: false, mesaj: 'Yedek henüz hazır değil.' }); return true; }
      const boyut = statSync(is.dosya).size;
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': boyut,
        'Content-Disposition': `attachment; filename="${is.dosyaAdi}"`,
        'Cache-Control': 'no-store'
      });
      const akis = createReadStream(is.dosya);
      akis.pipe(res);
      res.on('finish', () => {
        // Tamamı gönderildi: geçici dosya silinir (yarıda kalırsa süre dolana kadar tekrar indirilebilir).
        try { unlinkSync(is.dosya); } catch { /* zaten yok */ }
        disaAktarmaIsleri.delete(is.id);
        console.log(`[platform] Yedek indirildi (${boyut} bayt).`);
      });
      res.on('close', () => akis.destroy());
      return true;
    }

    // --- GET /platform/medya/<id> — şifreli medyayı çözerek akıtır (kasa açık olmalı) ---------
    const medyaEslesme = /^\/platform\/medya\/([A-Za-z0-9_-]{1,100})$/.exec(yol);
    if (req.method === 'GET' && medyaEslesme) {
      if (!disTokenGecerli) { tokenYok(); return true; }
      await medyaSun(req, res, medyaEslesme[1], url.searchParams.get('indir') === '1', jsonGonder);
      return true;
    }

    // --- POST /platform/sonuc/* — Playwright raporlayıcısının yazma uçları -------------------
    const sonucEslesme = /^\/platform\/sonuc\/(durum|medya-anahtari|kosu|kaydet|bitir)$/.exec(yol);
    if (req.method === 'POST' && sonucEslesme) {
      await raporlayiciIsteginiIsle(req, res, sonucEslesme[1], baglam);
      return true;
    }

    // --- /platform/tarama/* — "Ekranı otomatik tara" (iş yöneticisi: tarama/yonetici.mjs; kendi token/gövde kontrolü) ---
    if (yol.startsWith('/platform/tarama/')) {
      return await taramaIsteginiIsle(req, res, {
        token: baglam.token, disTokenGecerli, jsonGonder, jsonGovde, acikVeritabani, projeKoku: PROJE_KOKU
      });
    }

    // --- GET /platform/sonuclar/html-rapor — paylaşılabilir HTML rapor (kasa açık olmalı; görüntü çözme asenkron) ---
    if (req.method === 'GET' && yol === '/platform/sonuclar/html-rapor') {
      if (!disTokenGecerli) { tokenYok(); return true; }
      const db = await acikVeritabani();
      res.setHeader('Cache-Control', 'no-store');
      // b verilirse iki koşunun karşılaştırma raporu (sonuclar/karsilastirma.mjs).
      const rapor = url.searchParams.get('b')
        ? await karsilastirmaRaporuOlustur(db, url.searchParams, { medyaKlasoru: medyaKlasoruYolu() })
        : await htmlRaporuOlustur(db, url.searchParams, { medyaKlasoru: medyaKlasoruYolu() });
      jsonGonder(res, 200, { basarili: true, ...rapor, onizlemeId: onizlemeSakla(rapor.html) });
      return true;
    }
    // Önizleme: tek kullanımlık, kendi CSP'siyle (betik yok); arayüzde iframe sandbox="" içinde açılır.
    const raporOnizleme = /^\/platform\/sonuclar\/html-rapor\/onizleme\/([a-f0-9]{32})$/.exec(yol);
    if (req.method === 'GET' && raporOnizleme) {
      if (!disTokenGecerli) { tokenYok(); return true; }
      await acikVeritabani();
      const html = onizlemeAl(raporOnizleme[1]);
      if (html === null) { jsonGonder(res, 404, { basarili: false, mesaj: 'Önizlemenin süresi doldu; seçeneği değiştirerek yeniden hazırlayın.' }); return true; }
      res.writeHead(200, { ...ONIZLEME_BASLIKLARI });
      res.end(html);
      return true;
    }

    // --- GET ayarlar uçları (kasa açık olmalı) -----------------------------------------------
    const getIslemi = req.method === 'GET' ? GET_UCLARI.get(yol) : undefined;
    if (getIslemi) {
      if (!disTokenGecerli) { tokenYok(); return true; }
      const db = await acikVeritabani();
      res.setHeader('Cache-Control', 'no-store');
      jsonGonder(res, 200, { basarili: true, ...(await getIslemi(db, url.searchParams)) });
      return true;
    }

    // --- POST /platform/yedek/ice-aktar (ham dosya gövdesi) → önizleme hazırlığı --------------
    if (req.method === 'POST' && yol === '/platform/yedek/ice-aktar') {
      if (!disTokenGecerli) { tokenYok(); return true; }
      const hamParola = req.headers['x-kasa-parola'];
      let parola = '';
      try {
        parola = typeof hamParola === 'string' ? decodeURIComponent(hamParola) : '';
      } catch {
        parola = '';
      }
      if (!parola) {
        res.setHeader('Connection', 'close');
        jsonGonder(res, 400, { basarili: false, mesaj: 'Yedeğin kasa parolası X-Kasa-Parola başlığında (encodeURIComponent ile) gönderilmelidir.' });
        return true;
      }
      // Bekleme süresi / meşgul kontrolü dosya okunmadan önce yapılır.
      try {
        denemeSiniri.kontrolEt();
        if (iceAktarma.aktifIs()) throw new YedekHatasi('MESGUL', 'Başka bir içe aktarma sürüyor; bitmesini bekleyin.');
        const mevcutDb = await platformVeritabani();
        if (mevcutDb && kasaDurumu(mevcutDb).olusturuldu && !arayuzAcikMi(mevcutDb)) {
          throw new KasaHatasi('KASA_KILITLI', 'İçe aktarma için önce bu makinedeki kasayı açın.');
        }
      } catch (hata) {
        res.setHeader('Connection', 'close');
        throw hata;
      }
      eskiYuklemeleriTemizle();
      const dosya = join(yuklemeKlasoru(), `yukleme-${randomBytes(8).toString('hex')}.tayedek`);
      let boyut = 0;
      try {
        boyut = await govdeyiDosyayaYaz(req, dosya, YEDEK_YUKLEME_SINIRI);
      } catch (hata) {
        const cokBuyuk = Boolean(/** @type {{ cokBuyuk?: boolean }} */ (hata).cokBuyuk);
        res.setHeader('Connection', 'close');
        jsonGonder(res, cokBuyuk ? 413 : 400, {
          basarili: false,
          mesaj: cokBuyuk ? `Yedek dosyası en fazla ${YEDEK_YUKLEME_SINIRI / 1024 / 1024 / 1024} GB olabilir.` : 'Dosya okunamadı.'
        });
        return true;
      }
      if (!boyut) {
        try { unlinkSync(dosya); } catch { /* zaten yok */ }
        jsonGonder(res, 400, { basarili: false, mesaj: 'Boş dosya gönderildi.' });
        return true;
      }
      const isId = iceAktarma.baslat(dosya, parola, { geciciDosya: true });
      parola = '';
      jsonGonder(res, 202, { basarili: true, isId });
      return true;
    }

    // --- POST /platform/senaryo-dosyasi/yukle | /platform/ekran-dosyasi/yukle (ham dosya gövdesi) ----------
    // Dosya yalnızca BELLEKTE tutulur ve şifreli medya deposuna şifrelenerek yazılır (düz metin diske yazılmaz).
    // Ad X-Dosya-Adi başlığında (encodeURIComponent). Senaryo: ?projeId&ekranId&alan (modeldeki dosya alanı; kabul
    // edilen uzantılar modelden). Ekran ayarı: ?projeId&ekranId&yol=<JSON yol> (mevcut dosya değeri değiştirilir).
    if (req.method === 'POST' && (yol === '/platform/senaryo-dosyasi/yukle' || yol === '/platform/ekran-dosyasi/yukle')) {
      if (!disTokenGecerli) { res.setHeader('Connection', 'close'); tokenYok(); return true; }
      let icerik;
      try {
        icerik = await ikiliGovdeOku(req, DOSYA_BOYUT_SINIRI);
      } catch (hata) {
        const cokBuyuk = Boolean(/** @type {{ cokBuyuk?: boolean }} */ (hata).cokBuyuk);
        res.setHeader('Connection', 'close');
        jsonGonder(res, cokBuyuk ? 413 : 400, { basarili: false, mesaj: cokBuyuk ? `Dosya en fazla ${DOSYA_BOYUT_SINIRI / 1024 / 1024} MB olabilir.` : 'Dosya okunamadı.' });
        return true;
      }
      try {
        const db = await acikVeritabani();
        let ad = '';
        try { ad = decodeURIComponent(String(req.headers['x-dosya-adi'] ?? '')); } catch { ad = ''; }
        const projeId = kimlikAl(url.searchParams.get('projeId'), 'projeId');
        const ekranId = kimlikAl(url.searchParams.get('ekranId'), 'ekranId');
        if (!ekranlariListele(db, projeId).some((e) => e.id === ekranId)) throw new DepoHatasi('Ekran bulunamadı.');
        if (yol === '/platform/senaryo-dosyasi/yukle') {
          const alan = metinAl(url.searchParams.get('alan'));
          const kabul = dosyaAlaniKabulu(db, ekranId, alan);
          const d = await senaryoDosyasiEkle(db, { klasor: medyaKlasoruYolu(), icerik, ad, kabul, sahipTuru: 'senaryo' });
          console.log(`[platform] Senaryo dosyası şifreli depoya yüklendi (${d.boyut} bayt).`);
          jsonGonder(res, 200, { basarili: true, dosya: d });
        } else {
          let ayarYolu;
          try { ayarYolu = JSON.parse(String(url.searchParams.get('yol') ?? '')); } catch { throw new DepoHatasi('"yol" geçersiz.'); }
          // Uzantı: mevcut değerle aynı olmalı (ör. ürünün Excel'i yine Excel olmalı).
          const mevcut = ekranDosyalari(db, projeId).ekranlar.find((e) => e.id === ekranId)?.dosyalar
            .find((x) => JSON.stringify(x.yol) === JSON.stringify(ayarYolu));
          if (!mevcut) throw new DepoHatasi('Bu ayar bir dosya değeri değil.');
          const eskiAd = mevcut.dosya ? mevcut.dosya.ad : String(mevcut.eskiYol);
          const uzanti = eskiAd.includes('.') ? `.${eskiAd.split('.').pop()}` : '';
          const d = await senaryoDosyasiEkle(db, { klasor: medyaKlasoruYolu(), icerik, ad, kabul: kabulUzantilari(uzanti).join(','), sahipTuru: 'ekran', sahipId: ekranId });
          ekranDosyasiniDegistir(db, projeId, ekranId, ayarYolu, d.referans);
          console.log(`[platform] Ekran dosyası değiştirildi (şifreli, ${d.boyut} bayt).`);
          jsonGonder(res, 200, { basarili: true, dosya: d });
        }
      } finally {
        icerik.fill(0);
      }
      return true;
    }

    if (req.method !== 'POST') {
      jsonGonder(res, 404, { basarili: false, mesaj: 'Bilinmeyen platform uç noktası.' });
      return true;
    }

    const govde = await jsonGovde(PAKET_UCLARI.has(yol) ? PAKET_BOYUT_SINIRI : JSON_GOVDE_SINIRI);
    if (!govde) return true;
    if (govde.token !== baglam.token && !disTokenGecerli) { tokenYok(); return true; }
    platformEtkinligiBildir();
    const metin = (/** @type {unknown} */ d) => (typeof d === 'string' ? d : '');

    if (isEslesme && isEslesme[2] === 'uygula') {
      const secim = govde.tumu === true
        ? { tumu: true }
        : { secimler: /** @type {Record<string, string[]>} */ (govde.secimler) };
      const sonuc = await iceAktarma.uygula(isEslesme[1], secim);
      // Yeni çalışma alanına ilk yükleme: kayıt defteri (son açılan, proje sayısı) ve bağlantı dosyası güncellenir.
      if (vt && aktifAlan && !aktifAlan.sabit) {
        try { alanAcildi(VERI_KOKU, aktifAlan.id, { projeSayisi: Number(vt.tek('SELECT COUNT(*) AS n FROM projeler')?.n ?? 0) }); } catch { /* yalnızca gösterim */ }
        baglantiDosyasiniYaz();
      }
      // Tam yükleme kasayı yeniden anahtarlayabilir / tercihleri değiştirebilir: DPAPI dosyası ve tercih uzlaştırılır.
      if (vt && arayuzAcikMi(vt)) arkaPlan.kasaAcildi(vt);
      console.log(`[platform] Yedek içe aktarıldı (${sonuc.tamYukleme ? 'tam yükleme' : 'seçmeli'}), üzerine yazılan sürüm geçmişe: ${sonuc.gecmiseYazilan}.`);
      jsonGonder(res, 200, { basarili: true, sonuc });
      return true;
    }
    if (isEslesme && isEslesme[2] === 'iptal') {
      const iptal = iceAktarma.iptal(isEslesme[1]);
      jsonGonder(res, iptal ? 200 : 409, iptal
        ? { basarili: true, mesaj: 'İçe aktarma iptal edildi; hazırlık alanı silindi.' }
        : { basarili: false, mesaj: 'İçe aktarma bulunamadı veya artık iptal edilemez.' });
      return true;
    }

    // İzin denetimi (TEK MERKEZ: guvenlik/uc-denetimi.mjs; uç → izin eşlemesi izin-tanimlari.mjs'den). Kapalı izne tabi işlem
    // hiç başlatılmaz: 403 IZIN_KAPALI. Riskli ortamda açık onay (canliOnay: true) yoksa 409 CANLI_ONAY_GEREKLI.
    if (IZIN_DENETIMLI_UCLAR.has(yol)) ucDenetle(await acikVeritabani(), yol, govde);

    const postIslemi = POST_UCLARI.get(yol);
    if (postIslemi) {
      const db = await acikVeritabani();
      res.setHeader('Cache-Control', 'no-store');
      jsonGonder(res, 200, { basarili: true, ...(await postIslemi(db, govde)) });
      return true;
    }

    switch (yol) {
      case '/platform/giris-tarifi/oner': {
        // YALNIZCA kullanıcı "Varsayılanları öner"e açıkça basınca: ortamın giriş sayfası başsız tarayıcıda
        // açılır, form ALGILANIR (hiçbir alan doldurulmaz/gönderilmez). Adres ortamın taban adresi + tarifteki
        // (ya da formdaki) giriş yolu.
        const db = await acikVeritabani();
        const projeId = kimlikAl(govde.projeId, 'projeId');
        const ortam = ortamGetir(db, kimlikAl(govde.ortamId, 'ortamId'));
        if (!ortam || ortam.projeId !== projeId) throw new DepoHatasi('Ortam bulunamadı.');
        const yolHam = metin(govde.girisAdresi).trim() || '/';
        if (!yolHam.startsWith('/') && !/^https?:\/\//i.test(yolHam)) throw new DepoHatasi('Giriş adresi "/" ile başlayan bir yol ya da http(s) adresi olmalıdır.');
        // Açık onay (arayüz sorar: "giriş sayfası tarayıcıda açılacak"); izin + riskli ortam onayı yukarıda (ucDenetle) denetlendi.
        if (govde.onay !== true) throw new DepoHatasi('Giriş sayfası tarayıcıda açılacak: önce uyarıyı onaylayın.');
        const adres = new URL(yolHam, ortam.tabanUrl).toString();
        // Yasak adresler (Ayarlar > Güvenlik + ortam değişkeni): tarayıcı açılmadan reddedilir; sayfanın yasaklı host'a
        // yönlendirmesi / istekleri de tarayıcıda iptal edilir.
        const desenler = etkinYasakDesenleri(db);
        const yasakKalibi = adresYasakliMi(adres, desenler) ?? adresYasakliMi(ortam.tabanUrl, desenler);
        if (yasakKalibi) throw new DepoHatasi(`Öneri reddedildi: adres yasaklı adres kalıbına ("${yasakKalibi}") uyuyor (Ayarlar > Güvenlik > Yasak adresler). Tarayıcı açılmadı.`);
        if (girisOnerisiSuruyor) throw new DepoHatasi('Başka bir öneri sürüyor; bitmesini bekleyin.');
        girisOnerisiSuruyor = true;
        try {
          console.log('[platform] Giriş sayfası algılanıyor (kullanıcı isteği; alanlar doldurulmaz).');
          const oneri = await girisSayfasiniOner(adres, { yasakDesenleri: desenler });
          jsonGonder(res, 200, { basarili: true, oneri: { ...oneri, sonAdres: oneri.sonAdres ? new URL(oneri.sonAdres).pathname : null } });
        } finally {
          girisOnerisiSuruyor = false;
        }
        return true;
      }
      case '/platform/senaryolar/calistir': {
        // Koşu bitene kadar yanıt bekletilir (satır "çalışıyor" görünür); durdurma /durdur, canlı görüntü /canli ile.
        const db = await acikVeritabani();
        const sonuc = await senaryoCalistir(db, govde, kosucu, calistirmaSecenekleri(db));
        jsonGonder(res, sonuc.httpDurum, sonuc.govde);
        return true;
      }
      case '/platform/senaryo/dene': {
        const db = await acikVeritabani();
        const sonuc = await senaryoDene(db, govde, kosucu);
        jsonGonder(res, sonuc.httpDurum, sonuc.govde);
        return true;
      }
      case '/platform/kasa/olustur': {
        const db = /** @type {import('./veritabani/baglanti.mjs').Veritabani} */ (await platformVeritabani({ olustur: true }));
        const kasa = await kasaOlustur(db, metin(govde.parola));
        guvenlikAyariniYukle(db);
        arkaPlan.kasaAcildi(db);
        if (aktifAlan && !aktifAlan.sabit) alanAcildi(VERI_KOKU, aktifAlan.id, { projeSayisi: 0 });
        baglantiDosyasiniYaz();
        console.log('[platform] Kasa oluşturuldu.');
        jsonGonder(res, 200, { basarili: true, kasa });
        return true;
      }
      case '/platform/kasa/ac': {
        const db = await platformVeritabani();
        if (!db) throw new KasaHatasi('KASA_YOK', 'Kasa henüz oluşturulmamış.');
        const kasa = await denemeSiniri.dene(() => kasaAc(db, metin(govde.parola)));
        yerelMakine(db);
        guvenlikAyariniYukle(db);
        arkaPlan.kasaAcildi(db);
        if (aktifAlan && !aktifAlan.sabit) {
          try { alanAcildi(VERI_KOKU, aktifAlan.id, { projeSayisi: Number(db.tek('SELECT COUNT(*) AS n FROM projeler')?.n ?? 0) }); } catch { /* yalnızca gösterim */ }
        }
        jsonGonder(res, 200, { basarili: true, kasa });
        return true;
      }
      case '/platform/kasa/kilitle': {
        // { tamamen?: true } — tercih (A/B) açıkken "Kilitle (zamanlanmış koşular sürsün)" varsayılandır; "Tamamen kilitle"
        // bellekteki anahtarı da siler. Tercihler kapalıyken bugünkü gibi tamamen kilitlenir.
        const db = await platformVeritabani();
        const sonuc = db ? arkaPlan.kilitle(db, { tamamen: govde.tamamen === true }) : { arkaPlan: false };
        jsonGonder(res, 200, { basarili: true, kasa: db ? kasaDurumu(db) : { olusturuldu: false, acik: false }, arkaPlan: sonuc.arkaPlan });
        return true;
      }
      case '/platform/kasa/parola-degistir': {
        const db = await platformVeritabani();
        if (!db) throw new KasaHatasi('KASA_YOK', 'Kasa henüz oluşturulmamış.');
        const kasa = await denemeSiniri.dene(() => parolaDegistir(db, metin(govde.eskiParola), metin(govde.yeniParola)));
        console.log(`[platform] Kasa parolası değiştirildi (${kasa.yenidenSifrelenen} değer yeniden şifrelendi).`);
        // Zamanlayıcının bellekteki anahtarı ve (varsa) DPAPI dosyası yeni anahtarla yenilenir; yenilenemezse silinip uyarılır.
        await arkaPlan.parolaDegisti(db);
        jsonGonder(res, 200, { basarili: true, kasa });
        return true;
      }
      case '/platform/yedek/disa-aktar': {
        const db = await platformVeritabani();
        if (!db) throw new KasaHatasi('KASA_YOK', 'Kasa henüz oluşturulmamış.');
        if (!arayuzAcikMi(db)) throw new KasaHatasi('KASA_KILITLI', 'Kasa kilitli. Önce kasa parolasıyla kasayı açın.');
        const secim = medyaSeciminiCoz({
          ekranGoruntuleriDahil: /** @type {boolean | undefined} */ (govde.ekranGoruntuleriDahil),
          videolarDahil: /** @type {boolean | undefined} */ (govde.videolarDahil),
          izDosyalariDahil: /** @type {boolean | undefined} */ (govde.izDosyalariDahil)
        });
        disaAktarmaTemizle();
        // Önceki bir sunucu oturumundan kalan (indirilmemiş) geçici yedekler.
        const disaKlasor = join(varsayilanYedekKlasoru(db), '.disa-aktarma');
        if (existsSync(disaKlasor)) {
          const bilinen = new Set([...disaAktarmaIsleri.values()].map((i) => i.dosya));
          for (const ad of readdirSync(disaKlasor)) {
            const tam = join(disaKlasor, ad);
            try {
              if (!bilinen.has(tam) && Date.now() - statSync(tam).mtimeMs > DISA_AKTARMA_SAKLAMA_MS) unlinkSync(tam);
            } catch { /* yok sayılır */ }
          }
        }
        if ([...disaAktarmaIsleri.values()].some((i) => i.durum === 'hazirlaniyor')) {
          throw new YedekHatasi('MESGUL', 'Başka bir dışa aktarma sürüyor; bitmesini bekleyin.');
        }
        const anahtar = await denemeSiniri.dene(async () => {
          const a = await parolayiDogrula(db, metin(govde.parola));
          if (!a) throw new KasaHatasi('PAROLA_YANLIS', 'Kasa parolası yanlış.');
          return a;
        });
        anahtar.fill(0);
        const makineAdi = hostname().replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) || 'makine';
        const id = randomBytes(8).toString('hex');
        /** @type {DisaAktarmaIsi} */
        const is = {
          id, durum: 'hazirlaniyor', asama: 'başlıyor', yuzde: 0, bayt: null, mesaj: null,
          dosya: join(varsayilanYedekKlasoru(db), '.disa-aktarma', `${id}${YEDEK_UZANTISI}`),
          dosyaAdi: `platform-yedek-${makineAdi}-${dosyaZamani(new Date())}${YEDEK_UZANTISI}`,
          boyut: null, medya: null, sonKullanma: Date.now() + DISA_AKTARMA_SAKLAMA_MS
        };
        disaAktarmaIsleri.set(id, is);
        // "Son dışa aktarma" işareti dışa aktarma BAŞLARKENKİ değişiklik sayacıyla yazılır (bu arada olan değişiklikler
        // dışa aktarılmamış sayılır). Çalışma alanını kapatırken "dışa aktarmak ister misiniz?" sorusu buna bakar.
        const baslangicSayaci = degisiklikDurumu(db).sayac;
        yedekDosyasiYaz(db, is.dosya, {
          ...secim, medyaKlasoru: medyaKlasoruYolu(),
          ilerleme: (asama, yuzde, bayt) => { is.asama = asama; is.yuzde = yuzde; if (bayt) is.bayt = bayt; }
        }).then((sonuc) => {
          is.durum = 'hazir';
          is.asama = 'hazır';
          is.yuzde = 100;
          is.boyut = sonuc.boyut;
          is.medya = sonuc.manifest.medya ?? null;
          is.sonKullanma = Date.now() + DISA_AKTARMA_SAKLAMA_MS;
          if (!db.kapali) {
            try {
              db.sayacsizIslem(() => db.metaYaz(SON_DISA_AKTARMA_META, JSON.stringify({ sayac: baslangicSayaci, zaman: new Date().toISOString() })));
            } catch (hata) {
              console.error(`[platform] Dışa aktarma işareti yazılamadı: ${/** @type {Error} */ (hata)?.message ?? hata}`);
            }
          }
          console.log(`[platform] Yedek hazırlandı (${sonuc.boyut} bayt, ${is.medya?.dosyaSayisi ?? 0} medya dosyası).`);
        }).catch((/** @type {unknown} */ hata) => {
          is.durum = 'hata';
          is.mesaj = hata instanceof YedekHatasi || hata instanceof KasaHatasi
            ? hata.message : `Yedek alınamadı: ${/** @type {Error} */ (hata)?.message ?? String(hata)}`;
          console.error(`[platform] Dışa aktarma başarısız: ${is.mesaj}`);
        });
        jsonGonder(res, 202, { basarili: true, isId: id, secim });
        return true;
      }
      case '/platform/yedek/otomatik': {
        const db = await platformVeritabani();
        if (!db) throw new KasaHatasi('KASA_YOK', 'Kasa henüz oluşturulmamış.');
        const sonuc = otomatikYedekAl(db);
        console.log(`[platform] Otomatik yedek alındı: ${sonuc.dosya}`);
        jsonGonder(res, 200, { basarili: true, dosya: sonuc.dosya, boyut: sonuc.boyut, silinenler: sonuc.silinenler });
        return true;
      }
      default:
        jsonGonder(res, 404, { basarili: false, mesaj: 'Bilinmeyen platform uç noktası.' });
        return true;
    }
  } catch (hata) {
    const yanit = hataYaniti(hata);
    if (!yanit) throw hata;
    if (!res.headersSent) jsonGonder(res, yanit.durum, yanit.govde);
    return true;
  }
}

// ---------------------------------------------------------------------------------------
// Medya sunma ve raporlayıcı uçları
// ---------------------------------------------------------------------------------------

const MEDYA_UZANTILARI = Object.freeze({
  'image/png': 'png', 'image/jpeg': 'jpg', 'video/webm': 'webm', 'video/mp4': 'mp4', 'application/zip': 'zip',
  'text/markdown': 'md', 'text/plain': 'txt', 'application/json': 'json'
});
const MEDYA_TUR_ETIKETLERI = Object.freeze({ ekran_goruntusu: 'ekran-goruntusu', video: 'video', iz: 'iz', diger: 'ek' });
const TR_ASCII = Object.freeze({ ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' });

/**
 * İndirme adı: "<senaryo> - <yyyy-aa-gg_ss-dd> - <tür>.<uzantı>" (yerel saat; dosya sistemi güvenli).
 * @param {NonNullable<ReturnType<typeof medyaGetir>>} m
 */
export function medyaIndirmeAdi(m) {
  const t = new Date(m.sonucZamani ?? m.olusturulma);
  const iki = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const tarih = Number.isNaN(t.getTime()) ? 'tarihsiz'
    : `${t.getFullYear()}-${iki(t.getMonth() + 1)}-${iki(t.getDate())}_${iki(t.getHours())}-${iki(t.getMinutes())}`;
  const uzanti = /** @type {Record<string, string>} */ (MEDYA_UZANTILARI)[m.icerikTuru.toLowerCase()]
    ?? (m.tur === 'iz' ? 'zip' : 'bin');
  const temel = `${m.senaryoBaslik ?? 'medya'} - ${tarih} - ${/** @type {Record<string, string>} */ (MEDYA_TUR_ETIKETLERI)[m.tur] ?? 'ek'}`
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 150);
  return `${temel}.${uzanti}`;
}

/** @param {string} ad */
function asciiAd(ad) {
  return ad.replace(/[çÇğĞıİöÖşŞüÜ]/g, (k) => /** @type {Record<string, string>} */ (TR_ASCII)[k] ?? '_').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
}

/** "bytes=a-b" → { baslangic, bitis } | undefined (başlık yok) | null (karşılanamaz). @param {string | undefined} baslik @param {number} boyut */
function aralikCoz(baslik, boyut) {
  if (!baslik) return undefined;
  const e = /^bytes=(\d*)-(\d*)$/.exec(baslik.trim());
  if (!e || (e[1] === '' && e[2] === '')) return null;
  let baslangic;
  let bitis;
  if (e[1] === '') {
    const son = Number(e[2]);
    if (son === 0) return null;
    baslangic = Math.max(0, boyut - son);
    bitis = boyut - 1;
  } else {
    baslangic = Number(e[1]);
    bitis = e[2] === '' ? boyut - 1 : Math.min(Number(e[2]), boyut - 1);
  }
  if (!Number.isFinite(baslangic) || !Number.isFinite(bitis) || baslangic > bitis || baslangic >= boyut) return null;
  return { baslangic, bitis };
}

/**
 * GET /platform/medya/<id>: kasa açık olmalı (değilse 423). Dosya çözülerek parça parça akıtılır;
 * Range (206) desteklenir. Düz metin diske yazılmaz, önbelleğe alınmaz.
 * @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res
 * @param {string} id @param {boolean} indir
 * @param {(res: import('node:http').ServerResponse, durum: number, govde: unknown) => void} jsonGonder
 */
async function medyaSun(req, res, id, indir, jsonGonder) {
  const db = await acikVeritabani();
  const m = medyaGetir(db, id);
  if (!m) { jsonGonder(res, 404, { basarili: false, mesaj: 'Medya bulunamadı.' }); return; }
  if (m.silinme) { jsonGonder(res, 410, { basarili: false, mesaj: 'Bu video saklama süresi dolduğu için silindi.' }); return; }
  // Senaryo dosyaları (ör. müşteri listesi Excel'i) yalnızca koşuda kullanılır; düz metin olarak indirilmez/gösterilmez.
  if (m.tur === SENARYO_DOSYASI_TURU) { jsonGonder(res, 403, { basarili: false, mesaj: 'Senaryo dosyaları indirilemez; yalnızca koşuda (geçici olarak) çözülür.' }); return; }
  const klasor = medyaKlasoruYolu();
  const yol = medyaDosyaAdiGecerliMi(m.dosya) ? join(klasor, m.dosya) : null;
  if (!yol || !existsSync(yol)) {
    jsonGonder(res, 404, {
      basarili: false,
      kod: m.yedekDisi ? 'YEDEGE_DAHIL_DEGIL' : 'DOSYA_YOK',
      mesaj: m.yedekDisi
        ? 'Bu medya yedeğe dahil edilmemişti (dışa aktarırken bu medya türü seçilmemiş).'
        : 'Medya dosyası bu bilgisayarda yok (başka bir makinede kaydedilmiş olabilir).'
    });
    return;
  }
  let boyut;
  try {
    ({ duzBoyut: boyut } = await medyaBoyutu(yol));
  } catch {
    jsonGonder(res, 500, { basarili: false, mesaj: 'Medya dosyası okunamadı (bozuk).' });
    return;
  }
  const aralik = aralikCoz(typeof req.headers.range === 'string' ? req.headers.range : undefined, boyut);
  if (aralik === null) {
    res.writeHead(416, { 'Content-Range': `bytes */${boyut}`, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ basarili: false, mesaj: 'İstenen bayt aralığı karşılanamıyor.' }));
    return;
  }
  const ad = medyaIndirmeAdi(m);
  /** @type {Record<string, string | number>} */
  const basliklar = {
    'Content-Type': m.icerikTuru || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
    'Content-Disposition': `${indir ? 'attachment' : 'inline'}; filename="${asciiAd(ad)}"; filename*=UTF-8''${encodeURIComponent(ad)}`,
    'Content-Length': aralik ? aralik.bitis - aralik.baslangic + 1 : boyut,
    ...(aralik ? { 'Content-Range': `bytes ${aralik.baslangic}-${aralik.bitis}/${boyut}` } : {})
  };
  const anahtar = medyaAnahtariniHazirla(db);
  let kapandi = false;
  res.on('close', () => { kapandi = true; });
  try {
    res.writeHead(aralik ? 206 : 200, basliklar);
    if (req.method === 'HEAD' || boyut === 0) { res.end(); return; }
    for await (const parca of medyaCoz(anahtar, yol, aralik ?? {})) {
      if (kapandi) break;
      if (!res.write(parca)) await new Promise((coz) => { res.once('drain', coz); res.once('close', coz); });
    }
    res.end();
  } catch (hata) {
    console.error(`[platform] Medya akıtılamadı: ${hata instanceof MedyaHatasi ? hata.message : /** @type {Error} */ (hata)?.message}`);
    res.destroy();
  } finally {
    anahtar.fill(0);
  }
}

/**
 * Raporlayıcı uçları. Oturum token'ı ya da raporlayıcı token'ı gerekir; kasa GEREKMEZ.
 * @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res @param {string} islem
 * @param {{ token: string; raporlayiciTokeni?: string; jsonGonder: (res: import('node:http').ServerResponse, durum: number, govde: unknown) => void }} baglam
 */
async function raporlayiciIsteginiIsle(req, res, islem, baglam) {
  const { jsonGonder } = baglam;
  let govde;
  try {
    const metin = (await ikiliGovdeOku(req, SONUC_GOVDE_SINIRI)).toString('utf8');
    govde = /** @type {Record<string, unknown>} */ (metin ? JSON.parse(metin) : {});
    if (typeof govde !== 'object' || govde === null || Array.isArray(govde)) throw new Error('nesne değil');
  } catch {
    jsonGonder(res, 400, { basarili: false, mesaj: 'Geçersiz istek gövdesi.' });
    return;
  }
  const baslikToken = req.headers['x-test-sunucu-token'];
  const token = typeof govde.token === 'string' ? govde.token : typeof baslikToken === 'string' ? baslikToken : '';
  const gecerli = [baglam.token, baglam.raporlayiciTokeni].some((t) => typeof t === 'string' && t.length > 0 && t === token);
  if (!gecerli) { jsonGonder(res, 401, { basarili: false, mesaj: 'Geçersiz token.' }); return; }
  // Koşu başka bir çalışma alanının veritabanıyla başladıysa (sunucuda çalışma alanı sonradan değişti) sonuç YAZILMAZ —
  // bir çalışma alanının sonuçları diğerine karışmasın.
  const acikYol = veritabaniYolu();
  if (typeof govde.veritabaniYolu === 'string' && govde.veritabaniYolu && (!acikYol || resolve(govde.veritabaniYolu) !== resolve(acikYol))) {
    jsonGonder(res, 409, { basarili: false, kod: 'CALISMA_ALANI_FARKLI', mesaj: 'Koşunun çalışma alanı sunucuda artık açık değil; sonuç bu çalışma alanına yazılmadı.' });
    return;
  }
  const db = await platformVeritabani();
  if (!db) {
    jsonGonder(res, 200, islem === 'durum' ? { basarili: true, etkin: false, veritabaniYolu: acikYol } : { basarili: false, mesaj: 'Platform veritabanı yok.' });
    return;
  }
  switch (islem) {
    case 'durum': {
      const projeId = typeof govde.projeId === 'string' && govde.projeId ? govde.projeId : null;
      const proje = projeId && db.tek('SELECT id FROM projeler WHERE id = ?', [projeId]) ? { id: projeId } : undefined;
      const etkin = Boolean(proje) && kasaDurumu(db).olusturuldu;
      // Ortam kimliği doğrudan gelir — yalnızca bu projenin ortamıysa kabul edilir.
      const verilenOrtamId = proje && typeof govde.ortamId === 'string' && govde.ortamId
        && db.tek('SELECT id FROM ortamlar WHERE id = ? AND proje_id = ?', [govde.ortamId, proje.id]) ? govde.ortamId : null;
      jsonGonder(res, 200, {
        basarili: true, etkin, veritabaniYolu: veritabaniYolu(), medyaKlasoru: medyaKlasoruYolu(),
        projeId: proje?.id ?? null,
        ortamId: verilenOrtamId,
        medyaZarfi: db.metaOku(MEDYA_ANAHTARI_META) ?? null
      });
      return;
    }
    case 'medya-anahtari': {
      const mevcut = db.metaOku(MEDYA_ANAHTARI_META);
      if (mevcut) { jsonGonder(res, 200, { basarili: true, zarf: mevcut }); return; }
      if (!zarfMi(govde.zarf)) { jsonGonder(res, 400, { basarili: false, mesaj: 'Geçersiz medya anahtarı zarfı.' }); return; }
      if (kasaAcikMi(db)) {
        try {
          medyaAnahtariniAc(govde.zarf, acikAnahtar(db)).fill(0);
        } catch {
          jsonGonder(res, 400, { basarili: false, mesaj: 'Medya anahtarı bu kasanın anahtarıyla açılmıyor.' });
          return;
        }
      }
      const zarf = govde.zarf;
      db.islem(() => db.metaYaz(MEDYA_ANAHTARI_META, zarf));
      jsonGonder(res, 200, { basarili: true, zarf });
      return;
    }
    case 'kosu':
      kosuKaydet(db, /** @type {Parameters<typeof kosuKaydet>[1]} */ (govde.kosu));
      jsonGonder(res, 200, { basarili: true });
      return;
    case 'kaydet': {
      const { id, silinecekMedyaDosyalari } = sonucKaydet(db, /** @type {Parameters<typeof sonucKaydet>[1]} */ (govde.sonuc));
      for (const d of silinecekMedyaDosyalari) medyaDosyasiniSil(medyaKlasoruYolu(), d);
      jsonGonder(res, 200, { basarili: true, id });
      return;
    }
    case 'bitir': {
      const bitenKosu = kimlikAl(govde.kosuId, 'kosuId');
      kosuyuBitir(db, bitenKosu, { durum: metinAl(govde.durum), bitis: typeof govde.bitis === 'string' ? govde.bitis : undefined });
      jsonGonder(res, 200, { basarili: true });
      // Entegrasyonlar: "koşu bitti" bildirimleri (arka planda; hata koşuyu etkilemez, yalnız bağlantı durumuna yazılır).
      // Toplu koşuda her senaryo aynı koşu kimliğiyle "bitir" der: bildirim, o koşudan KOSU_BILDIRIM_BEKLEMESI_MS boyunca yeni
      // "bitir" gelmezse bir kez (son özetle) gönderilir.
      clearTimeout(bekleyenKosuBildirimleri.get(bitenKosu));
      bekleyenKosuBildirimleri.set(bitenKosu, setTimeout(() => {
        bekleyenKosuBildirimleri.delete(bitenKosu);
        platformVeritabani().then((acik) => { if (acik) return kosuBittiBildir(acik, bitenKosu); }).catch(() => { /* bildirim koşuyu etkilemez */ });
      }, KOSU_BILDIRIM_BEKLEMESI_MS).unref());
      return;
    }
    default:
      jsonGonder(res, 404, { basarili: false, mesaj: 'Bilinmeyen uç nokta.' });
  }
}

/** Sunucu açıkken ve kasa açıkken günde bir yerel otomatik yedek alır. */
export function platformOtomatikYedekZamanla() {
  const zamanlayici = setInterval(() => {
    if (!vt || !kasaAcikMi(vt)) return;
    try {
      const sonuc = otomatikYedekAl(vt, { saklanacak: kosuAyarlariniOku(vt).otomatikYedekSayisi });
      console.log(`[platform] Günlük otomatik yedek alındı: ${sonuc.dosya}`);
    } catch (hata) {
      console.error(`[platform] Günlük otomatik yedek alınamadı: ${/** @type {Error} */ (hata)?.message ?? hata}`);
    }
  }, 24 * 60 * 60 * 1000);
  zamanlayici.unref();
}
