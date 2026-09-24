// Dashboard istemci betiği (tarayıcıda çalışır; modül DEĞİL, düz <script>).
//
// scripts/rapor/dashboard-html.mjs bu dosyayı okuyup dashboard-<ortam>.html içindeki
// <script> etiketine olduğu gibi gömer. Aşağıdaki "İSTEMCİ KODU BAŞLANGICI" satırından
// ÖNCESİ (bu açıklama) gömülmez. Eskiden bu kod urun-hata-raporu.mjs içindeki bir
// template literal'in parçasıydı — artık normal bir JS dosyası: kaçış karakterleri
// ("\\" vb.) iki katına çıkarılmaz, ${...} ile sunucu değeri enjekte EDİLEMEZ.
//
// Sunucu tarafında üretilen değerler aynı <script> etiketinin başında, bu koddan
// hemen önce tanımlanır (bkz. dashboard-html.mjs):
//   VERI        — urun-hata-raporu.mjs'nin hesapladığı tüm rapor verisi
//   ORTAM       — 'test' | 'canli'
//   TEST_SUNUCU — { taban, token } (scripts/test-sunucu.mjs)
//   SenaryoDogrulayici — TEK senaryo doğrulayıcısı (scripts/dogrulama/senaryo-dogrulayici.mjs,
//                 tarayici-paketi.mjs ile sarılıp gömülür; sunucu ve spec aynı dosyayı kullanır)
/* global VERI, ORTAM, TEST_SUNUCU, SenaryoDogrulayici */
// --- İSTEMCİ KODU BAŞLANGICI ---
  // "Adım bazlı başarı" tablosunda o an açık olan ürünün adım listesi (satır tıklama
  // olay dinleyicilerinin büyük veriyi DOM'a yazmadan erişmesi için).
  var AKTIF_ADIM_LISTESI = [];
  // "Adım bazlı başarı" tablosunda açık olan satırın adı — tablo yeniden çizildiğinde
  // (ör. bir koşu bitince) satır kapanmasın diye tutulur; ürün değişince null olur.
  var ACIK_ADIM_ADI = null;

  function escapeHtml(metin) {
    return String(metin).replace(/[&<>"']/g, function (k) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[k];
    });
  }

  // "▶ Videoyu izle" bağlantısı (yeni sekmede açılır). yol: canlı koşuda test sunucusunun
  // şifreli medya adresi (/platform/medya/<id>; kasa açıkken çözülerek akıtılır) ya da platform
  // sonuç kaydı kapalıyken eski /medya URL'si. Video yoksa boş döner.
  // Koşu sonucunun son ekran görüntüsü: platformda şifreli medya adresi (ekranGoruntusuUrl),
  // eski yolda (sonuç kaydı kapalı) base64 gövde. Hiçbiri yoksa null.
  function ekranGoruntusuKaynagi(veri) {
    if (veri && veri.ekranGoruntusuUrl) return veri.ekranGoruntusuUrl;
    if (veri && veri.ekranGoruntusu) return 'data:image/png;base64,' + veri.ekranGoruntusu;
    return null;
  }

  function videoBaglantisiHtml(yol) {
    if (!yol) return '';
    return '<div><a class="video-baglanti" href="' + escapeHtml(yol) + '" target="_blank" rel="noopener">▶ Videoyu izle</a></div>';
  }

  // Ham (teknik) hata mesajını okuyup, tanınan kalıplardan biriyle eşleşiyorsa sade bir
  // Türkçe "olası neden" açıklaması üretir. Yeni bir hata kalıbı görüldükçe buraya yeni
  // bir if bloğu eklenir — tanınmayan bir mesaj için null döner (yanlış yorum yapıp
  // yanıltmaktansa hiçbir şey göstermemeyi tercih ederiz).
  function olasiNedenBul(mesaj) {
    if (!mesaj) return null;

    if (/Target page, context or browser has been closed/i.test(mesaj)) {
      return 'Tarayıcı/sayfa bu hatadan önce zaten kapanmıştı — genelde testin genel süre sınırına ' +
        '(test timeout) takılıp otomatik sonlandırılmasının bir sonucudur, kendisi ayrı/yeni bir hata değildir.';
    }

    if (/Test timeout of [0-9]+ms exceeded/i.test(mesaj) && /waiting for (getByRole|getByText|getByLabel|getByTestId|getByPlaceholder|locator)/i.test(mesaj)) {
      var elemanEslesme = mesaj.match(/name: '([^']+)'/);
      var elemanAdi = elemanEslesme ? elemanEslesme[1] : null;
      return (elemanAdi ? 'Sistem "' + elemanAdi + '" elemanını' : 'Sistem ilgili elemanı') +
        ' belirtilen süre boyunca aradı ama bulamadı. Genelde üç sebepten biri: (1) önceki adımda oluşan ' +
        'sessiz bir hata yüzünden akış beklenen ekrana hiç ulaşmamış, (2) ekrandaki buton/metin adı ' +
        'değişmiş, (3) sunucu yanıtı normalden çok geç gelmiş (performans/ağ sorunu).';
    }

    if (/strict mode violation|resolved to [0-9]+ elements/i.test(mesaj)) {
      return 'Aynı isim/metinle eşleşen birden fazla eleman bulundu, seçici (locator) tek bir elemanı ' +
        'işaret etmiyor — sayfada beklenmeyen bir tekrar/kopya eleman olabilir.';
    }

    if (/toBeVisible/i.test(mesaj)) {
      return 'Beklenen eleman ekranda görünür değildi — ilgili ekran hiç açılmamış ya da farklı bir ' +
        'durumda kalmış olabilir.';
    }

    if (/toHaveValue|toHaveText|toHaveURL/i.test(mesaj)) {
      return 'Ekranda görünen değer/metin, testin beklediğinden farklı çıktı — ya ekran davranışı ' +
        'değişmiş ya da test verisiyle ekran senkron değil.';
    }

    if (/net::ERR_/i.test(mesaj)) {
      return 'Tarayıcı sunucuya bağlanamadı / istek tamamlanamadı (ağ veya sunucu tarafı bir sorun olabilir).';
    }

    return null;
  }

  // input[type=datetime-local] ile uyumlu "YYYY-MM-DDTHH:mm" biçimi.
  function gunSaatAnahtari(zamanMs) {
    var d = new Date(zamanMs);
    var yil = d.getFullYear();
    var ay = String(d.getMonth() + 1).padStart(2, '0');
    var gun = String(d.getDate()).padStart(2, '0');
    var saat = String(d.getHours()).padStart(2, '0');
    var dakika = String(d.getMinutes()).padStart(2, '0');
    return yil + '-' + ay + '-' + gun + 'T' + saat + ':' + dakika;
  }

  // Kategori -> sabit renk eşlemesi (VERI.kategoriler sırasına göre).
  var KATEGORI_RENKLERI = ['#d03b3b', '#c47f0a', '#2456c9', '#7c5cff', '#8a8879'];
  function kategoriRengi(kategoriAdi) {
    var idx = VERI.kategoriler.indexOf(kategoriAdi);
    return KATEGORI_RENKLERI[idx >= 0 ? idx : KATEGORI_RENKLERI.length - 1];
  }

  // Ürün başına tüm-zamanlar başarısız sayısı (yan panel rozetleri için).
  // "Durduruldu" (kullanıcı durdurdu) kayıtlar başarısız SAYILMAZ.
  var urunBasarisizSayilari = {};
  VERI.kayitlar.forEach(function (k) {
    if (k.d === 'basarisiz') {
      urunBasarisizSayilari[k.u] = (urunBasarisizSayilari[k.u] || 0) + 1;
    }
  });

  var GENEL = null; // "GENEL" sekmesi seçiliyken secilenUrun bu değeri alır (tüm ürünler).
  var genelBasarisizToplam = 0;
  Object.keys(urunBasarisizSayilari).forEach(function (urun) { genelBasarisizToplam += urunBasarisizSayilari[urun]; });

  var secilenUrun = GENEL; // Varsayılan ekran: GENEL (tüm ürünlerin özeti).
  var kosuGecmisiSayfa = 1; // "Koşu geçmişi" tablosunun geçerli sayfası (1'den başlar).
  var KOSU_GECMISI_SAYFA_BOYUTU = 10;
  var kalipSayfa = 1; // "Hata kalıpları" listesinin geçerli sayfası (1'den başlar).
  var KALIP_SAYFA_BOYUTU = 8; // Her kalıp ekran görüntüsü içerebildiğinden sayfa boyutu küçük tutulur.
  var senaryoTablosuSayfa = 1; // "Senaryolar" tablosunun geçerli sayfası (1'den başlar).
  var SENARYO_TABLOSU_SAYFA_BOYUTU = 10;

  function urunNavCiz() {
    var alan = document.getElementById('urunNav');
    var genelAktifSinif = secilenUrun === GENEL ? ' aktif' : '';
    var genelHtml =
      '<button type="button" class="urun-oge' + genelAktifSinif + '" data-urun="__genel__" style="margin-bottom:4px">' +
      '<span class="urun-oge-ad">Genel</span>' +
      '<span class="urun-oge-adet' + (genelBasarisizToplam === 0 ? ' sifir' : '') + '">' + genelBasarisizToplam + '</span>' +
      '</button>';

    if (VERI.urunler.length === 0) {
      alan.innerHTML = genelHtml + '<div class="bos-durum">Kayıtlı ürün verisi yok.</div>';
    } else {
      alan.innerHTML =
        genelHtml +
        VERI.urunler
          .map(function (urun) {
            var aktifSinif = urun === secilenUrun ? ' aktif' : '';
            var adet = urunBasarisizSayilari[urun] || 0;
            var adetSinif = adet === 0 ? ' sifir' : '';
            return (
              '<button type="button" class="urun-oge' + aktifSinif + '" data-urun="' + escapeHtml(urun) + '">' +
              '<span class="urun-oge-ad">' + escapeHtml(urun) + '</span>' +
              '<span class="urun-oge-adet' + adetSinif + '">' + adet + '</span>' +
              '</button>'
            );
          })
          .join('');
    }

    Array.prototype.forEach.call(alan.querySelectorAll('.urun-oge'), function (dugme) {
      dugme.addEventListener('click', function () {
        var deger = dugme.getAttribute('data-urun');
        var yeniUrun = deger === '__genel__' ? GENEL : deger;
        // Ürün değişince "Senaryolar" tablosundaki seçim temizlenir — gizlenen ürünün
        // seçili senaryoları sonradan "Seçilenleri çalıştır" ile fark edilmeden koşmasın.
        if (yeniUrun !== secilenUrun) SENARYO_TABLOSU_SECILI.clear();
        secilenUrun = yeniUrun;
        // Ürün değişince "Senaryolar" listesi baştan değişir, bu yüzden sayfa 1'e
        // dönülür — ama secimGuncellendi() BAŞKA yerlerden de (ör. tek bir senaryo
        // koşusu bitince) çağrıldığından bu satır kasıtlı olarak SADECE burada, gerçek
        // ürün değişiminde duruyor; secimGuncellendi()'nin içine KONMADI — yoksa bir
        // koşu bitip listeyi tazelediğinde kullanıcı sayfa 3'teyken sayfa 1'e atılırdı.
        senaryoTablosuSayfa = 1;
        // Aynı gerekçeyle "Koşu geçmişi" / "Hata kalıpları" sayfaları ve açık adım
        // satırı da YALNIZCA burada (ürün değişince) sıfırlanır; koşu bitince çağrılan
        // secimGuncellendi() mevcut sayfayı korur (sayfa artık yoksa çizim sırasında
        // son sayfaya sıkıştırılır — bkz. kosuGecmisiniGuncelle/tabloyuGuncelle).
        kosuGecmisiSayfa = 1;
        kalipSayfa = 1;
        ACIK_ADIM_ADI = null;
        secimGuncellendi();
      });
    });
  }

  function tarihSinirlariniAyarla(baslangicId, bitisId) {
    if (VERI.kayitlar.length === 0) return;
    var minZaman = VERI.kayitlar[0].z;
    var maxZaman = VERI.kayitlar[0].z;
    VERI.kayitlar.forEach(function (k) {
      if (k.z < minZaman) minZaman = k.z;
      if (k.z > maxZaman) maxZaman = k.z;
    });
    // Bitiş alanı dakikaya yuvarlanırken (saniyeler atılır) son kaydın dışarıda
    // kalmaması için bir dakika yukarı taşınır.
    document.getElementById(baslangicId).value = gunSaatAnahtari(minZaman);
    document.getElementById(bitisId).value = gunSaatAnahtari(maxZaman + 60000);
  }

  function secilenTarihAraligi(baslangicId, bitisId) {
    var baslangicStr = document.getElementById(baslangicId).value;
    var bitisStr = document.getElementById(bitisId).value;
    return {
      baslangicMs: baslangicStr ? new Date(baslangicStr).getTime() : -Infinity,
      bitisMs: bitisStr ? new Date(bitisStr).getTime() : Infinity
    };
  }

  // ---------- Tablo sütun başlıklarına tıklayarak sıralama ----------
  // Her tablo için { anahtar, yon } tutulur. anahtar: null => tablonun doğal/varsayılan
  // sırası kullanılır (ör. adım tablosunda ürüne özel ekran akışı sırası bozulmasın diye).
  var SIRALAMA_DURUMU = {
    urunOzet: { anahtar: 'basarisiz', yon: 'desc' },
    kosuGecmisi: { anahtar: 'z', yon: 'desc' },
    adimOzet: { anahtar: null, yon: null }
  };

  function diziyiSirala(dizi, anahtar, yon, degerFn) {
    if (!anahtar || !degerFn) return dizi;
    var isaret = yon === 'asc' ? 1 : -1;
    return dizi.slice().sort(function (a, b) {
      var va = degerFn(a), vb = degerFn(b);
      if (typeof va === 'string') return va.localeCompare(vb, 'tr') * isaret;
      if (va < vb) return -1 * isaret;
      if (va > vb) return 1 * isaret;
      return 0;
    });
  }

  // th.siralanabilir'lerin ok yönünü mevcut SIRALAMA_DURUMU'na göre günceller —
  // hangi tabloya ait olursa olsun, o an DOM'da bulunan tüm sıralanabilir başlıklarda çalışır.
  function siralamaOklariniGuncelle() {
    Array.prototype.forEach.call(document.querySelectorAll('th.siralanabilir'), function (th) {
      var tablo = th.getAttribute('data-tablo');
      var anahtar = th.getAttribute('data-anahtar');
      var durum = SIRALAMA_DURUMU[tablo];
      th.classList.remove('siram-asc', 'siram-desc');
      if (durum && durum.anahtar === anahtar) th.classList.add(durum.yon === 'asc' ? 'siram-asc' : 'siram-desc');
    });
  }

  document.addEventListener('click', function (olay) {
    var th = olay.target.closest('th.siralanabilir');
    if (!th) return;
    var tablo = th.getAttribute('data-tablo');
    var anahtar = th.getAttribute('data-anahtar');
    var tur = th.getAttribute('data-tur') || 'sayi';
    var durum = SIRALAMA_DURUMU[tablo];
    if (!durum) return;
    if (durum.anahtar === anahtar) {
      durum.yon = durum.yon === 'asc' ? 'desc' : 'asc';
    } else {
      durum.anahtar = anahtar;
      durum.yon = tur === 'metin' ? 'asc' : 'desc';
    }
    if (tablo === 'urunOzet') urunOzetTablosunuGuncelle();
    else if (tablo === 'kosuGecmisi') kosuGecmisiniGuncelle();
    else if (tablo === 'adimOzet') ikinciBolumuCiz();
  });

  // "Koşu trendi"nin yanındaki ikinci grafik: satır başına (ürün ya da adım) başarılı/başarısız
  // yığılmış yatay çubuk. Çubuğun toplam uzunluğu o satırın toplam test sayısıyla, rengi
  // başarılı/başarısız oranıyla orantılı — aynı veri "Ürün bazlı özet" / "Adım bazlı başarı"
  // tablosunda sayısal olarak da gösterilir.
  function ozetBarGrafiginiCiz(kapAlaniId, satirlar) {
    var alan = document.getElementById(kapAlaniId);
    if (!alan) return;
    if (satirlar.length === 0) {
      alan.innerHTML = '<div class="bos-durum">Gösterilecek veri yok.</div>';
      return;
    }
    var maxToplam = 1;
    satirlar.forEach(function (s) {
      var t = s.basarili + s.basarisiz;
      if (t > maxToplam) maxToplam = t;
    });
    alan.innerHTML =
      '<div class="ozet-grafik">' +
      satirlar
        .map(function (s) {
          var toplam = s.basarili + s.basarisiz;
          var izGenislik = (toplam / maxToplam) * 100;
          var basariliYuzde = toplam > 0 ? (s.basarili / toplam) * 100 : 0;
          var basarisizYuzde = toplam > 0 ? (s.basarisiz / toplam) * 100 : 0;
          return (
            '<div class="ozet-grafik-satir">' +
            '<div class="ozet-grafik-etiket" title="' + escapeHtml(s.etiket) + '">' + escapeHtml(s.etiket) + '</div>' +
            '<div class="ozet-grafik-iz"><div class="ozet-grafik-dolum" style="width:' + izGenislik.toFixed(1) + '%">' +
            '<div class="ozet-grafik-basarili" style="flex-basis:' + basariliYuzde.toFixed(1) + '%"></div>' +
            '<div class="ozet-grafik-basarisiz" style="flex-basis:' + basarisizYuzde.toFixed(1) + '%"></div>' +
            '</div></div>' +
            '<div class="ozet-grafik-sayi">' + s.basarili + '/' + s.basarisiz + '</div>' +
            '</div>'
          );
        })
        .join('') +
      '</div>';
  }

  // "Koşu geçmişi" ile yanındaki tablonun (Ürün bazlı özet / Adım bazlı başarı) kart
  // yüksekliklerini eşitler. Bilerek CSS'teki canlı flex-stretch yerine burada, her iki
  // taraf da KAPALI/başlangıç haliyken (adım satırı açılmadan önce) tek seferlik ölçüm
  // yapılır ve sonuç sabit bir max-height olarak uygulanır. Böylece sağdaki tabloda bir
  // adım satırı açılıp kayıt listesi görününce kart büyümez, kendi içinde kayar —
  // soldaki "Koşu geçmişi" kartı bundan etkilenmez.
  function ikizTablolarinYuksekliginiEsitle() {
    var cift = document.querySelector('.ikiz-izgara-tablolar');
    if (!cift) return;
    var kartlar = cift.querySelectorAll(':scope > section > .kart, :scope > section > div > .kart');
    if (kartlar.length < 2) return;
    // Kartların dış görünür boyu zaten CSS Grid + flex:1 ile (kartı saran <section>'lar eşit
    // yüksekliğe gerilir, her kart kendi bölümünün kalan boşluğunu doldurur) hizalanıyor —
    // burada o hizayı BOZMADAN, her kartın kendi o anki (kapalı/başlangıç) yüksekliğini kendi
    // max-height'i olarak dondurup kilitliyoruz. Böylece örn. sağdaki tabloda bir adım satırı
    // açılıp kayıt listesi görününce o kart büyümez, kendi içinde kayar; soldaki kart, kendi
    // bağımsız max-height'iyle hiç etkilenmez.
    Array.prototype.forEach.call(kartlar, function (k) { k.style.maxHeight = 'none'; });
    Array.prototype.forEach.call(kartlar, function (k) { k.style.maxHeight = k.offsetHeight + 'px'; });
  }

  // "Ürün bazlı özet" tablosu: seçilen tarih aralığında TÜM ürünlerin toplamlarını hesaplar.
  function urunOzetTablosunuGuncelle() {
    var govde = document.getElementById('urunOzetGovdesi');
    var ozetAlani = document.getElementById('secimOzetiUrun');
    if (!govde || !ozetAlani) return; // İkinci bölüm şu an adım tablosunu gösteriyorsa bu elemanlar yok.
    var aralik = secilenTarihAraligi('baslangicTarihiUrun', 'bitisTarihiUrun');

    var urunToplamlari = {}; // urun -> { basarili, basarisiz, atlanan, durduruldu }
    var toplamKayit = 0;
    VERI.kayitlar.forEach(function (k) {
      if (k.z < aralik.baslangicMs || k.z > aralik.bitisMs) return;
      toplamKayit++;
      if (!urunToplamlari[k.u]) urunToplamlari[k.u] = { basarili: 0, basarisiz: 0, atlanan: 0, durduruldu: 0 };
      if (urunToplamlari[k.u][k.d] !== undefined) urunToplamlari[k.u][k.d]++;
    });

    ozetAlani.textContent = toplamKayit + ' test kaydı';
    document.getElementById('ucuncuBaslikSayisi').textContent = toplamKayit + ' test kaydı';

    var satirDizisi = Object.keys(urunToplamlari).map(function (urun) {
      var s = urunToplamlari[urun];
      var toplam = s.basarili + s.basarisiz + s.atlanan;
      var oran = toplam > 0 ? Math.round((s.basarili / toplam) * 100) : 0;
      return { urun: urun, basarili: s.basarili, basarisiz: s.basarisiz, atlanan: s.atlanan, durduruldu: s.durduruldu, oran: oran };
    });
    document.getElementById('ikinciBaslikSayisi').textContent = satirDizisi.length + ' ürün';

    var durum = SIRALAMA_DURUMU.urunOzet;
    var DEGER_FN_URUN = {
      urun: function (r) { return r.urun; },
      basarili: function (r) { return r.basarili; },
      basarisiz: function (r) { return r.basarisiz; },
      atlanan: function (r) { return r.atlanan; },
      durduruldu: function (r) { return r.durduruldu; },
      oran: function (r) { return r.oran; }
    };
    satirDizisi = diziyiSirala(satirDizisi, durum.anahtar, durum.yon, DEGER_FN_URUN[durum.anahtar]);
    siralamaOklariniGuncelle();

    if (satirDizisi.length === 0) {
      govde.innerHTML = '<tr><td colspan="6">Seçilen tarih aralığında veri yok</td></tr>';
      ozetBarGrafiginiCiz('ozetGrafikAlani', []);
      ikizTablolarinYuksekliginiEsitle();
      return;
    }

    ozetBarGrafiginiCiz('ozetGrafikAlani', satirDizisi.map(function (r) {
      return { etiket: r.urun, basarili: r.basarili, basarisiz: r.basarisiz };
    }));

    govde.innerHTML = satirDizisi
      .map(function (r) {
        var barRengi = r.oran >= 80 ? 'var(--good)' : r.oran >= 50 ? 'var(--warning)' : 'var(--critical)';
        return (
          '<tr>' +
          '<td>' + escapeHtml(r.urun) + '</td>' +
          '<td class="num">' + r.basarili + '</td>' +
          '<td class="num">' + r.basarisiz + '</td>' +
          '<td class="num">' + r.atlanan + '</td>' +
          '<td class="num">' + r.durduruldu + '</td>' +
          '<td class="num"><div class="oran-hucre"><div class="oran-bar"><div class="oran-dolum" style="width:' + r.oran + '%;background:' + barRengi + '"></div></div><span>%' + r.oran + '</span></div></td>' +
          '</tr>'
        );
      })
      .join('');
    ikizTablolarinYuksekliginiEsitle();
  }

  // İkinci bölüm: GENEL seçiliyken "Ürün bazlı özet" (tarih filtreli tablo),
  // bir ürün seçiliyken o ürünün "Adım bazlı başarı" (step) tablosu.
  function ikinciBolumuCiz() {
    var baslik = document.getElementById('ikinciBaslik');
    var altBaslik = document.getElementById('ikinciAltBaslik');
    var alan = document.getElementById('ikinciBolumAlani');
    var ucuncuBaslik = document.getElementById('ucuncuBaslik');
    var ucuncuAltBaslik = document.getElementById('ucuncuAltBaslik');

    if (secilenUrun === GENEL) {
      baslik.textContent = 'Ürün bazlı özet';
      altBaslik.textContent = 'Ürün bazlı başarıda seçilen tarih aralığına göre filtrelenir.';
      ucuncuBaslik.textContent = 'Ürün bazlı başarı';
      ucuncuAltBaslik.textContent = 'Seçili tarih aralığında ürün başına başarılı/başarısız dağılımı — altındaki tabloyla aynı veri.';
      alan.innerHTML =
        '<div class="kart"><table>' +
        '<thead><tr>' +
        '<th class="siralanabilir" data-tablo="urunOzet" data-anahtar="urun" data-tur="metin">Ürün<span class="siralama-ok"></span></th>' +
        '<th class="num siralanabilir" data-tablo="urunOzet" data-anahtar="basarili" data-tur="sayi">Başarılı<span class="siralama-ok"></span></th>' +
        '<th class="num siralanabilir" data-tablo="urunOzet" data-anahtar="basarisiz" data-tur="sayi">Başarısız<span class="siralama-ok"></span></th>' +
        '<th class="num siralanabilir" data-tablo="urunOzet" data-anahtar="atlanan" data-tur="sayi">Atlanan<span class="siralama-ok"></span></th>' +
        '<th class="num siralanabilir" data-tablo="urunOzet" data-anahtar="durduruldu" data-tur="sayi">Durduruldu<span class="siralama-ok"></span></th>' +
        '<th class="num siralanabilir" data-tablo="urunOzet" data-anahtar="oran" data-tur="sayi">Başarı oranı<span class="siralama-ok"></span></th>' +
        '</tr></thead>' +
        '<tbody id="urunOzetGovdesi"></tbody></table></div>';

      urunOzetTablosunuGuncelle();
      return;
    }

    baslik.textContent = 'Adım bazlı başarı — ' + secilenUrun;
    altBaslik.textContent = 'Yukarıdaki tarih aralığı filtresine göre bu ürünün adımlarında (test.step) görülen başarı/başarısız sayısı.';
    ucuncuBaslik.textContent = 'Adım bazlı başarı — ' + secilenUrun;
    ucuncuAltBaslik.textContent = 'Seçili tarih aralığında adım başına başarılı/başarısız dağılımı — altındaki tabloyla aynı veri.';

    var adimlarHam = VERI.adimOzeti[secilenUrun] || [];
    if (adimlarHam.length === 0) {
      document.getElementById('secimOzetiUrun').textContent = '0 adım kaydı';
      document.getElementById('ucuncuBaslikSayisi').textContent = '0 adım kaydı';
      document.getElementById('ikinciBaslikSayisi').textContent = '0 adım';
      alan.innerHTML = '<div class="bos-durum">Bu ürün için kayıtlı adım (step) verisi yok — testler test.step() kullanmıyor olabilir.</div>';
      ozetBarGrafiginiCiz('ozetGrafikAlani', []);
      ikizTablolarinYuksekliginiEsitle();
      return;
    }

    // Adım başına başarılı/başarısız sayıları, seçili tarih aralığındaki kayıtlar (test
    // çalıştırma olayları) üzerinden yeniden hesaplanır — toplam sayı değil, o aralıkta
    // gerçekleşenler sayılır.
    var aralikAdim = secilenTarihAraligi('baslangicTarihiUrun', 'bitisTarihiUrun');
    var adimSatirlari = adimlarHam.map(function (a) {
      var kayitlarAralikta = (a.kayitlar || []).filter(function (k) { return k.z >= aralikAdim.baslangicMs && k.z <= aralikAdim.bitisMs; });
      var basarili = 0, basarisiz = 0;
      kayitlarAralikta.forEach(function (k) { if (k.basarili) basarili++; else basarisiz++; });
      var toplam = basarili + basarisiz;
      return { ad: a.ad, basarili: basarili, basarisiz: basarisiz, toplam: toplam, oran: toplam > 0 ? Math.round((basarili / toplam) * 100) : 0, kayitlar: kayitlarAralikta };
    }).filter(function (a) { return a.toplam > 0; });

    var toplamAdimKaydi = adimSatirlari.reduce(function (t, a) { return t + a.toplam; }, 0);
    document.getElementById('secimOzetiUrun').textContent = toplamAdimKaydi + ' adım kaydı';
    document.getElementById('ucuncuBaslikSayisi').textContent = toplamAdimKaydi + ' adım kaydı';
    document.getElementById('ikinciBaslikSayisi').textContent = adimSatirlari.length + ' adım';

    if (adimSatirlari.length === 0) {
      alan.innerHTML = '<div class="bos-durum">Seçilen tarih aralığında bu ürün için adım verisi yok.</div>';
      ozetBarGrafiginiCiz('ozetGrafikAlani', []);
      ikizTablolarinYuksekliginiEsitle();
      return;
    }

    var durumAdim = SIRALAMA_DURUMU.adimOzet;
    var DEGER_FN_ADIM = {
      ad: function (r) { return r.ad; },
      basarili: function (r) { return r.basarili; },
      basarisiz: function (r) { return r.basarisiz; },
      oran: function (r) { return r.oran; }
    };
    adimSatirlari = diziyiSirala(adimSatirlari, durumAdim.anahtar, durumAdim.yon, DEGER_FN_ADIM[durumAdim.anahtar]);

    // Tıklanan satırın kayıt listesini (adim-kayit) render edebilmek için satır
    // index'iyle eşleşen veriyi burada tutuyoruz; büyük veri DOM'a data-* olarak değil,
    // bu değişken üzerinden erişilir.
    AKTIF_ADIM_LISTESI = adimSatirlari;

    ozetBarGrafiginiCiz('ozetGrafikAlani', adimSatirlari.map(function (a) {
      return { etiket: a.ad, basarili: a.basarili, basarisiz: a.basarisiz };
    }));

    var satirlar = adimSatirlari
      .map(function (a, i) {
        var barRengi = a.oran >= 80 ? 'var(--good)' : a.oran >= 50 ? 'var(--warning)' : 'var(--critical)';
        return (
          '<tr class="adim-satir" data-index="' + i + '">' +
          '<td>' + escapeHtml(a.ad) + '</td>' +
          '<td class="num">' + a.basarili + '</td>' +
          '<td class="num">' + a.basarisiz + '</td>' +
          '<td class="num"><div class="oran-hucre"><div class="oran-bar"><div class="oran-dolum" style="width:' + a.oran + '%;background:' + barRengi + '"></div></div><span>%' + a.oran + '</span></div></td>' +
          '</tr>' +
          '<tr class="adim-detay-satir gizli" data-detay-index="' + i + '"><td colspan="4"></td></tr>'
        );
      })
      .join('');

    alan.innerHTML =
      '<div class="kart"><table>' +
      '<thead><tr>' +
      '<th class="siralanabilir" data-tablo="adimOzet" data-anahtar="ad" data-tur="metin">Adım<span class="siralama-ok"></span></th>' +
      '<th class="num siralanabilir" data-tablo="adimOzet" data-anahtar="basarili" data-tur="sayi">Başarılı<span class="siralama-ok"></span></th>' +
      '<th class="num siralanabilir" data-tablo="adimOzet" data-anahtar="basarisiz" data-tur="sayi">Başarısız<span class="siralama-ok"></span></th>' +
      '<th class="num siralanabilir" data-tablo="adimOzet" data-anahtar="oran" data-tur="sayi">Başarı oranı<span class="siralama-ok"></span></th>' +
      '</tr></thead>' +
      '<tbody>' + satirlar + '</tbody></table></div>';
    siralamaOklariniGuncelle();

    Array.prototype.forEach.call(alan.querySelectorAll('.adim-satir'), function (satir) {
      satir.addEventListener('click', function () {
        var i = Number(satir.getAttribute('data-index'));
        var detaySatir = alan.querySelector('.adim-detay-satir[data-detay-index="' + i + '"]');
        var aciliyorMu = detaySatir.classList.contains('gizli');
        // Aynı anda sadece bir satır açık kalsın (karışıklık olmasın diye).
        Array.prototype.forEach.call(alan.querySelectorAll('.adim-satir'), function (s) { s.classList.remove('acik'); });
        Array.prototype.forEach.call(alan.querySelectorAll('.adim-detay-satir'), function (d) { d.classList.add('gizli'); });
        if (!aciliyorMu) { ACIK_ADIM_ADI = null; return; } // zaten açıktı, kapatıldı — yeniden açma
        satir.classList.add('acik');
        detaySatir.classList.remove('gizli');
        ACIK_ADIM_ADI = AKTIF_ADIM_LISTESI[i].ad;
        adimKayitListesiniCiz(detaySatir.querySelector('td'), AKTIF_ADIM_LISTESI[i]);
      });
    });
    // Yeniden çizimden önce açık olan adım hâlâ listedeyse tekrar aç.
    var acikIndex = ACIK_ADIM_ADI === null ? -1 : adimSatirlari.findIndex(function (a) { return a.ad === ACIK_ADIM_ADI; });
    if (acikIndex >= 0) {
      var acikSatir = alan.querySelector('.adim-satir[data-index="' + acikIndex + '"]');
      var acikDetay = alan.querySelector('.adim-detay-satir[data-detay-index="' + acikIndex + '"]');
      acikSatir.classList.add('acik');
      acikDetay.classList.remove('gizli');
      adimKayitListesiniCiz(acikDetay.querySelector('td'), adimSatirlari[acikIndex]);
    }
    ikizTablolarinYuksekliginiEsitle();
  }

  // Bir adımın altındaki (açılan) kayıt listesini çizer — her kayıt tıklanınca detay
  // popup'ı (açıklama + varsa ekran görüntüsü) açılır.
  function adimKayitListesiniCiz(hucre, adim) {
    var kayitlar = adim.kayitlar || [];
    if (kayitlar.length === 0) {
      hucre.innerHTML = '<div class="bos-durum">Bu adım için kayıt bulunamadı.</div>';
      return;
    }
    hucre.innerHTML =
      '<div class="adim-kayit-listesi">' +
      kayitlar
        .map(function (k, i) {
          return (
            '<div class="adim-kayit" data-kayit-index="' + i + '">' +
            '<span class="adim-kayit-nokta ' + (k.basarili ? 'iyi' : 'kotu') + '"></span>' +
            '<span class="adim-kayit-tarih">' + escapeHtml(k.t) + '</span>' +
            '<span class="adim-kayit-ad">' + escapeHtml(k.ad) + '</span>' +
            '<span class="rozet ' + (k.basarili ? 'rozet-iyi' : 'rozet-kritik') + '">' + (k.basarili ? 'Başarılı' : 'Başarısız') + '</span>' +
            '</div>'
          );
        })
        .join('') +
      '</div>';

    Array.prototype.forEach.call(hucre.querySelectorAll('.adim-kayit'), function (satir) {
      satir.addEventListener('click', function () {
        var i = Number(satir.getAttribute('data-kayit-index'));
        adimDetayModalAc(adim.ad, kayitlar[i]);
      });
    });
  }

  function adimDetayModalAc(adimAdi, kayit) {
    document.querySelector('#adimDetayModalOrtu .modal-kutu').classList.remove('genis');
    var icerikAlani = document.getElementById('adimDetayModalIcerik');
    var govde =
      '<p class="modal-baslik">' + escapeHtml(adimAdi) + '</p>' +
      '<p class="modal-alt">' + escapeHtml(kayit.ad) + ' — ' + escapeHtml(kayit.t) + ' — ' +
      '<span class="rozet ' + (kayit.basarili ? 'rozet-iyi' : 'rozet-kritik') + '">' + (kayit.basarili ? 'Başarılı' : 'Başarısız') + '</span></p>';

    if (kayit.basarili) {
      govde += '<div class="bos-durum">Bu adım başarıyla tamamlandı, hata mesajı/ekran görüntüsü yok.</div>';
    } else {
      govde += '<div class="hata-ornek-etiket">Açıklama</div>';
      govde += kayit.m
        ? '<pre class="hata-mesaj">' + escapeHtml(kayit.m) + '</pre>'
        : '<div class="bos-durum">Bu kayıt için hata mesajı bulunamadı.</div>';
      var olasiNeden = olasiNedenBul(kayit.m);
      if (olasiNeden) {
        govde += '<div class="hata-ornek-etiket">Olası neden</div>';
        govde += '<div class="olasi-neden">' + escapeHtml(olasiNeden) + '</div>';
      }
      govde += kayit.g
        ? '<img class="hata-goruntu" src="' + escapeHtml(kayit.g) + '" alt="Adım hata anı ekran görüntüsü" />'
        : '<div class="bos-durum">Bu kayıt için ekran görüntüsü bulunamadı.</div>';
      govde += videoBaglantisiHtml(kayit.v);
    }

    icerikAlani.innerHTML = govde;
    document.getElementById('adimDetayModalOrtu').classList.add('acik');
  }

  function adimDetayModalKapat() {
    document.getElementById('adimDetayModalOrtu').classList.remove('acik');
  }

  // "Koşu geçmişi" satırına tıklayınca açılan Koşu > Ürün > Senaryo > Adım detay
  // penceresi. Tek bir durum nesnesiyle 3 seviye arasında gezinir; ekmek kırıntısındaki
  // (breadcrumb) adımlara tıklayarak geri dönülür.
  var KOSU_DETAY = { kosuIndex: null, urun: null, senaryoIndex: null };

  // Bir ürün sayfasındayken (GENEL değilken) detay penceresi doğrudan o ürünün
  // senaryo listesinden başlar; "tüm ürünler" seviyesi atlanır. GENEL'de kök null'dur.
  function kosuDetayKokUrun() {
    return secilenUrun === GENEL ? null : secilenUrun;
  }

  function kosuDetayAc(kosuIndex) {
    KOSU_DETAY = { kosuIndex: kosuIndex, urun: kosuDetayKokUrun(), senaryoIndex: null };
    document.querySelector('#adimDetayModalOrtu .modal-kutu').classList.add('genis');
    kosuDetayCiz();
    document.getElementById('adimDetayModalOrtu').classList.add('acik');
  }

  function kosuDetayEkmekCiz() {
    var kok = kosuDetayKokUrun();
    // Kök seviyedeyken (henüz kökten ileri gidilmemişken) breadcrumb, üstteki başlıkla
    // birebir aynı şeyi tekrar eder — o yüzden sadece daha derin seviyelerde gösterilir.
    if (KOSU_DETAY.urun === kok && KOSU_DETAY.senaryoIndex === null) return '';
    var kosu = VERI.kosuGecmisi[KOSU_DETAY.kosuIndex];
    var parcalar = [];
    // "Tüm ürünler" kırıntısı sadece GENEL modunda (kök null iken) anlamlıdır; ürüne özel
    // sayfada zaten en üstte seçili ürün var, tekrar ayrı bir "koşu" seviyesi gösterilmez.
    if (kok === null) {
      parcalar.push(KOSU_DETAY.urun === null
        ? '<b>' + escapeHtml(kosu.etiket) + '</b>'
        : '<button type="button" data-ekmek="kosu">' + escapeHtml(kosu.etiket) + '</button>');
    }
    if (KOSU_DETAY.urun !== null) {
      parcalar.push(KOSU_DETAY.senaryoIndex === null
        ? '<b>' + escapeHtml(KOSU_DETAY.urun) + '</b>'
        : '<button type="button" data-ekmek="urun">' + escapeHtml(KOSU_DETAY.urun) + '</button>');
    }
    if (KOSU_DETAY.senaryoIndex !== null) {
      var senaryo = VERI.kosuDetaylari[KOSU_DETAY.kosuIndex][KOSU_DETAY.urun][KOSU_DETAY.senaryoIndex];
      parcalar.push('<b>' + escapeHtml(senaryo.ad) + '</b>');
    }
    return '<p class="kosu-detay-ekmek">' + parcalar.join(' <span style="opacity:.5">›</span> ') + '</p>';
  }

  function kosuDetayGeri() {
    var kok = kosuDetayKokUrun();
    if (KOSU_DETAY.senaryoIndex !== null) KOSU_DETAY.senaryoIndex = null;
    else if (KOSU_DETAY.urun !== kok) KOSU_DETAY.urun = kok;
    else return; // zaten kök seviyedeyiz, gidecek yer yok
    kosuDetayCiz();
  }

  // Kök seviyedeyken geri gidecek bir yer olmadığı için boş döner.
  function kosuDetayGeriDugmesiCiz() {
    var kok = kosuDetayKokUrun();
    if (KOSU_DETAY.urun === kok && KOSU_DETAY.senaryoIndex === null) return '';
    return '<button type="button" class="kosu-detay-geri-buton" id="kosuDetayGeriDugmesi" title="Geri" aria-label="Geri">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"></path><path d="M12 19l-7-7 7-7"></path></svg>' +
      '</button>';
  }

  function kosuDetayCiz() {
    var icerikAlani = document.getElementById('adimDetayModalIcerik');
    var kosu = VERI.kosuGecmisi[KOSU_DETAY.kosuIndex];
    var senaryolar = VERI.kosuDetaylari[KOSU_DETAY.kosuIndex] || {};
    var govde = '';

    if (KOSU_DETAY.urun === null) {
      // 1. seviye: bu koşudaki ürünler (en üst seviye — geri butonu yok).
      govde += '<p class="modal-baslik">Koşu — ' + escapeHtml(kosu.etiket) + '</p>';
      govde += kosuDetayEkmekCiz();
      var urunAdlari = Object.keys(senaryolar).sort(function (a, b) { return a.localeCompare(b, 'tr'); });
      if (urunAdlari.length === 0) {
        govde += '<div class="bos-durum">Bu koşu için senaryo detayı bulunamadı.</div>';
      } else {
        govde += '<div class="kosu-detay-liste">' + urunAdlari.map(function (urunAdi) {
          var liste = senaryolar[urunAdi];
          var basarisizAdet = liste.filter(function (s) { return s.durum === 'basarisiz'; }).length;
          return (
            '<div class="kosu-detay-oge" data-urun="' + escapeHtml(urunAdi) + '">' +
            '<span class="kosu-detay-oge-ad">' + escapeHtml(urunAdi) + '</span>' +
            '<span class="rozet ' + (basarisizAdet > 0 ? 'rozet-kritik' : 'rozet-iyi') + '">' + basarisizAdet + '/' + liste.length + '</span>' +
            '</div>'
          );
        }).join('') + '</div>';
      }
      icerikAlani.innerHTML = govde;
      Array.prototype.forEach.call(icerikAlani.querySelectorAll('.kosu-detay-oge'), function (oge) {
        oge.addEventListener('click', function () {
          KOSU_DETAY.urun = oge.getAttribute('data-urun');
          kosuDetayCiz();
        });
      });
    } else if (KOSU_DETAY.senaryoIndex === null) {
      // 2. seviye: seçilen üründeki senaryolar (testler).
      var urunSenaryolari = senaryolar[KOSU_DETAY.urun] || [];
      govde += kosuDetayGeriDugmesiCiz();
      govde += '<p class="modal-baslik">' + escapeHtml(KOSU_DETAY.urun) + '</p>';
      govde += kosuDetayEkmekCiz();
      if (urunSenaryolari.length === 0) {
        govde += '<div class="bos-durum">Bu koşuda ' + escapeHtml(KOSU_DETAY.urun) + ' için senaryo çalıştırılmamış.</div>';
      } else {
        govde += '<div class="kosu-detay-liste">' + urunSenaryolari.map(function (s, i) {
          var rozetSinif = s.durum === 'basarisiz' ? 'rozet-kritik' : s.durum === 'atlanan' || s.durum === 'durduruldu' ? 'rozet-notr' : 'rozet-iyi';
          var rozetMetin = s.durum === 'basarisiz' ? 'Başarısız' : s.durum === 'atlanan' ? 'Atlandı' : s.durum === 'durduruldu' ? 'Durduruldu' : 'Başarılı';
          // ▷ / (çalışıyorsa) spinner + Durdur — "Senaryolar" tablosuyla AYNI global
          // çalışma durumundan (CALISAN_SENARYOLAR) çizilir; bkz. kosuDetayBaslatHtml.
          return (
            '<div class="kosu-detay-oge" data-senaryo-index="' + i + '">' +
            kosuDetayBaslatHtml(kosuDetaySenaryoAnahtari(s.ad, KOSU_DETAY.urun)) +
            '<span class="kosu-detay-oge-ad">' + escapeHtml(s.ad) + '</span>' +
            '<span class="rozet ' + rozetSinif + '">' + rozetMetin + '</span>' +
            '</div>'
          );
        }).join('') + '</div>';
      }
      icerikAlani.innerHTML = govde;
      Array.prototype.forEach.call(icerikAlani.querySelectorAll('.kosu-detay-oge'), function (oge) {
        oge.addEventListener('click', function (olay) {
          if (olay.target.closest('[data-senaryo-baslat]') || olay.target.closest('[data-senaryo-durdur]')) return;
          KOSU_DETAY.senaryoIndex = Number(oge.getAttribute('data-senaryo-index'));
          kosuDetayCiz();
        });
      });
      Array.prototype.forEach.call(icerikAlani.querySelectorAll('[data-senaryo-baslat]'), function (buton) {
        buton.addEventListener('click', function (olay) {
          olay.stopPropagation();
          senaryoBaslat(buton.getAttribute('data-senaryo-anahtar'), buton);
        });
      });
    } else {
      // 3. seviye: seçilen senaryonun adım adım (test.step) dökümü.
      var senaryo = (senaryolar[KOSU_DETAY.urun] || [])[KOSU_DETAY.senaryoIndex];
      govde += kosuDetayGeriDugmesiCiz();
      govde += '<p class="modal-baslik">' + escapeHtml(senaryo.ad) + '</p>';
      govde += kosuDetayEkmekCiz();

      if (senaryo.adimlar.length === 0) {
        govde += '<div class="bos-durum">Bu senaryo için adım (test.step) verisi yok.</div>';
        if (senaryo.durum === 'basarisiz' && senaryo.genelMesaj) {
          govde += '<div class="hata-ornek-etiket">Açıklama</div><pre class="hata-mesaj">' + escapeHtml(senaryo.genelMesaj) + '</pre>';
        }
      } else {
        govde += '<div class="kosu-detay-liste">' + senaryo.adimlar.map(function (a, i) {
          var parca = '<div class="kosu-detay-adim" data-adim-index="' + i + '">';
          parca += '<div class="kosu-detay-adim-satir' + (a.basarili ? '' : ' acik') + '">' +
            '<span class="kosu-detay-oge-ad">' + escapeHtml(a.ad) + '</span>' +
            '<span class="rozet ' + (a.basarili ? 'rozet-iyi' : 'rozet-kritik') + '">' + (a.basarili ? 'Başarılı' : 'Başarısız') + '</span>' +
            '</div>';
          var olasiNeden = a.m ? olasiNedenBul(a.m) : null;
          parca += '<div class="kosu-detay-adim-govde' + (a.basarili ? ' gizli' : '') + '">';
          if (a.basarili) {
            parca += '<div class="bos-durum">Bu adım başarıyla tamamlandı.</div>';
          } else {
            parca += a.m
              ? '<pre class="hata-mesaj">' + escapeHtml(a.m) + '</pre>'
              : '<div class="bos-durum">Bu adım için hata mesajı bulunamadı.</div>';
            if (olasiNeden) parca += '<div class="olasi-neden">' + escapeHtml(olasiNeden) + '</div>';
            parca += a.g
              ? '<img class="hata-goruntu" src="' + escapeHtml(a.g) + '" alt="Adım hata anı ekran görüntüsü" />'
              : '';
            parca += videoBaglantisiHtml(a.v);
          }
          parca += '</div>';
          parca += '</div>';
          return parca;
        }).join('') + '</div>';
      }
      icerikAlani.innerHTML = govde;
      Array.prototype.forEach.call(icerikAlani.querySelectorAll('.kosu-detay-adim-satir'), function (satir) {
        satir.addEventListener('click', function () {
          var govdeEl = satir.nextElementSibling;
          if (!govdeEl) return;
          satir.classList.toggle('acik');
          govdeEl.classList.toggle('gizli');
        });
      });
    }

    Array.prototype.forEach.call(icerikAlani.querySelectorAll('[data-ekmek]'), function (dugme) {
      dugme.addEventListener('click', function () {
        var seviye = dugme.getAttribute('data-ekmek');
        if (seviye === 'kosu') { KOSU_DETAY.urun = null; KOSU_DETAY.senaryoIndex = null; }
        else if (seviye === 'urun') { KOSU_DETAY.senaryoIndex = null; }
        kosuDetayCiz();
      });
    });
    var geriDugmesi = document.getElementById('kosuDetayGeriDugmesi');
    if (geriDugmesi) geriDugmesi.addEventListener('click', kosuDetayGeri);
  }

  // Yerel test sunucusuna (scripts/test-sunucu.mjs, "npm run test-sunucu" ile ayrı bir
  // pencerede çalıştırılmalı) bir senaryoyu çalıştırması için istek atar ve sonucu
  // BEKLER — sunucu, test bitene kadar yanıt vermiyor (bkz. testiCalistirVeBekle).
  // Dönen Promise, sunucudan gelen JSON gövdesiyle çözülür (asla reddedilmez —
  // ağ hatası da { basarili: false, mesaj: ... } şeklinde normalleştirilir).
  // kosuId: bu TEKİL koşu isteğine özel benzersiz kimlik — sunucu tarafında
  // calisanSurecler'i (ve /durdur, /canli uçlarını) senaryoAdi yerine bununla anahtarlar,
  // çünkü aynı başlık birden fazla ürün dosyasında tekrarlanabiliyor (bkz.
  // kosuIdOlustur ve satır bazlı Durdur butonundaki kullanım).
  function kosuIdOlustur() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // Aynı başlık birden fazla ürün dosyasında bulunabildiği için "Senaryolar" tablosu
  // senaryoları "dosya::ad" anahtarıyla tanır. Anahtarsız (yalnızca ad) çağrılar da
  // desteklenir; o durumda dosya gönderilmez ve sunucu adın tek dosyada olduğunu doğrular.
  var SENARYO_ANAHTAR_AYRACI = '::';
  function senaryoAnahtari(s) {
    return s.dosya ? s.dosya + SENARYO_ANAHTAR_AYRACI + s.ad : s.ad;
  }
  function senaryoAnahtarCoz(anahtar) {
    var i = anahtar.indexOf(SENARYO_ANAHTAR_AYRACI);
    var bilinen = i > 0 && (VERI.tumSenaryolar || []).some(function (s) { return s.dosya === anahtar.slice(0, i); });
    return bilinen
      ? { dosya: anahtar.slice(0, i), ad: anahtar.slice(i + SENARYO_ANAHTAR_AYRACI.length) }
      : { dosya: null, ad: anahtar };
  }

  // Sunucu tek bir koşuyu en fazla ~10 dk sonra kendisi durdurur (süre limiti). Bu
  // istemci tarafı sınır yalnızca sunucu hiç yanıt vermezse (takılma, bağlantı kopması)
  // satırın sonsuza kadar "çalışıyor" kalmaması için son güvencedir; sıra bekleme süresini
  // de kapsayacak kadar uzun tutulur.
  var SENARYO_ISTEK_ZAMAN_ASIMI_MS = 90 * 60 * 1000;

  function senaryoCalistirIstegiGonder(senaryoAnahtarVeyaAdi, kosuId, ekAlanlar) {
    var senaryo = senaryoAnahtarCoz(senaryoAnahtarVeyaAdi);
    var iptalDenetleyici = typeof AbortController === 'function' ? new AbortController() : null;
    var zamanlayici = iptalDenetleyici ? setTimeout(function () { iptalDenetleyici.abort(); }, SENARYO_ISTEK_ZAMAN_ASIMI_MS) : null;
    return fetch(TEST_SUNUCU.taban + '/calistir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ ortam: ORTAM, senaryoAdi: senaryo.ad, dosya: senaryo.dosya, kosuId: kosuId, token: TEST_SUNUCU.token }, ekAlanlar || {})),
      signal: iptalDenetleyici ? iptalDenetleyici.signal : undefined
    })
      .then(function (yanit) { return yanit.json(); })
      .catch(function (hata) {
        if (hata && hata.name === 'AbortError') {
          senaryoDurdurIstegiGonder(kosuId);
          return { basarili: false, mesaj: 'Test sunucusundan uzun süre yanıt alınamadı; koşu durduruldu.' };
        }
        return {
          basarili: false,
          mesaj: 'Test sunucusuna ulaşılamadı. Bir terminalde "npm run test-sunucu" çalıştırıp tekrar deneyin.'
        };
      })
      .finally(function () { if (zamanlayici) clearTimeout(zamanlayici); });
  }

  // Sunucuda o an çalışan bir koşuyu (aynı senaryoAdi ile) durdurmasını ister.
  // Sonucu beklemez — asıl sonuç, açık duran /calistir isteğinin yanıtından
  // (durum: "iptal") gelecektir.
  function senaryoDurdurIstegiGonder(kosuId) {
    return fetch(TEST_SUNUCU.taban + '/durdur', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kosuId: kosuId, token: TEST_SUNUCU.token })
    })
      .then(function (yanit) { return yanit.json(); })
      .catch(function () { return { basarili: false }; });
  }

  // Küçük bir "Durdur" ikon butonu üretir (id kontrolü için çağıran bağlar).
  function senaryoDurdurButonuOlustur() {
    var durdurButonu = document.createElement('button');
    durdurButonu.type = 'button';
    durdurButonu.className = 'senaryo-durdur-buton';
    durdurButonu.title = 'Durdur';
    durdurButonu.setAttribute('aria-label', 'Bu koşuyu durdur');
    durdurButonu.innerHTML = '<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14"></rect></svg>';
    return durdurButonu;
  }

  function senaryoDurumEtiketi(durum) {
    if (durum === 'passed') return 'Başarılı';
    if (durum === 'skipped') return 'Atlandı';
    if (durum === 'iptal') return 'Durduruldu';
    if (durum === 'failed' || durum === 'timedOut' || durum === 'interrupted') return 'Başarısız';
    return durum || 'Bilinmiyor';
  }

  function senaryoSureMetni(sureMs) {
    return typeof sureMs === 'number' ? (sureMs / 1000).toFixed(1) + ' sn' : '';
  }

  function kosuEtiketiClient(zamanDamgasiMs) {
    return new Date(zamanDamgasiMs).toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  // senaryoAnahtarVeyaAdi: "dosya::ad" anahtarı (tercih edilen — aynı başlık birden
  // fazla ürün dosyasında olabildiği için doğru ürünü bulur) ya da yalnızca ad (eski
  // localStorage kayıtları / anahtarı bilinmeyen çağrılar — ada göre ilk eşleşme).
  function senaryoUrunuBul(senaryoAnahtarVeyaAdi) {
    var cozulen = senaryoAnahtarCoz(senaryoAnahtarVeyaAdi);
    var eslesme = (VERI.tumSenaryolar || []).find(function (s) {
      return s.ad === cozulen.ad && (!cozulen.dosya || s.dosya === cozulen.dosya);
    });
    return eslesme ? eslesme.urun : 'Diğer';
  }

  // Dashboard'dan (▷ ikonuyla) tetiklenen tekil bir senaryo koşusu bittiğinde, raporu
  // yeniden üretmeden/sayfayı yeniden açmadan "Koşu geçmişi" tablosuna ANINDA yansısın
  // diye VERI'ye sentetik bir "tekil" koşu kaydı ekler (toplam=1). Tekil kayıtlar üst
  // özet kartlarını (VERI.kartlar — yalnızca TAM koşulardan, sunucuda hesaplanır) ve trend grafiğini
  // (yalnızca TAM koşular) KASITLI OLARAK ETKİLEMEZ; "Koşu geçmişi"nde "tekil" rozetiyle
  // görünür.
  //
  // NOT (kalıcılık): Bu kayıt AYRICA (varsayılan olarak, "depolaMi" false geçilmediği
  // sürece) tarayıcının localStorage'ına da yazılır — kullanıcı "Koşu geçmişi"nde
  // gördüğü bir sonucu sayfayı kapatıp/yenileyip tekrar bulamıyordu (rapor dosyası
  // statik olduğundan bir önceki "npm run rapor:*"teki veriyle yeniden yükleniyordu).
  // Sayfa açılışında (bkz. aşağıdaki anlikKosuDepoyuYukle) bu depo okunur; raporun
  // üretim anından (VERI.uretimMs) SONRA biten kayıtlar VERI'ye geri eklenir, öncekiler
  // (zaten rapordaki Allure sonuçlarında yer aldıkları için) atılır.
  // Ekran görüntüsü/video KASITLI OLARAK depolanmaz (localStorage boyutu — birkaç MB —
  // hızla dolar); sadece durum/hata mesajı kalıcı olur.
  // senaryoAnahtarVeyaAdi: "dosya::ad" anahtarı ya da yalnızca ad (bkz. senaryoUrunuBul).
  // grup: { kimlik, tur } — birlikte başlatılan senaryoların ortak koşu kimliği. Aynı
  // kimlikli sonuçlar "Koşu geçmişi"nde tek satırda toplanır.
  function anlikKosuKaydiEkle(senaryoAnahtarVeyaAdi, veri, depolaMi, grup) {
    var zamanMs = Date.now();
    if (!anlikKosuVeriyeEkle(senaryoAnahtarVeyaAdi, veri, zamanMs, grup)) return;

    if (depolaMi !== false) {
      anlikKosuDepoyaEkle(senaryoAnahtarVeyaAdi, veri, zamanMs, grup);
    }

    // NOT (önemli, koşu geçmişi görünmeme kök nedeni): "Koşu geçmişi" ve "Koşu trendi"
    // tabloları, sayfa açılışında "tüm zamanlar" diye doldurulan bitisTarihiKosu/
    // bitisTarihiTrend tarih filtrelerine göre süzülüyor (bkz. kosuGecmisiniGuncelle/
    // trendGrafiginiGuncelle). O ilk dolum SADECE o anki (geçmiş Allure) veriye
    // bakıyor — sonradan dashboard'dan tetiklenen YENİ bir koşunun zaman damgası bu
    // sınırın DIŞINDA kaldığından, kayıt VERI.kosuGecmisi'ne eklenmiş olsa bile
    // filtreye takılıp hiç görünmüyordu. Çözüm: yeni kaydın zamanı, bu iki tarih
    // filtresinin bitişini aşıyorsa bitişi buna göre ileri çekiyoruz.
    anlikKosuTarihSinirlariniGenisletGerekirse(zamanMs);

    secimGuncellendi();
  }

  // Kaydı yalnızca VERI'ye ekler (depolama/yeniden çizim YOK) — hem yeni biten koşu
  // (anlikKosuKaydiEkle) hem sayfa açılışında depodan geri yükleme (anlikKosuDepoyuYukle,
  // kaydın GERÇEK zamanıyla) bunu kullanır. Eklenmediyse (geçersiz sonuç) false döner.
  function anlikKosuVeriyeEkle(senaryoAnahtarVeyaAdi, veri, zamanMs, grup) {
    if (!veri || !veri.basarili || !veri.durum) return false;

    var senaryoAdi = senaryoAnahtarCoz(senaryoAnahtarVeyaAdi).ad;
    var urun = senaryoUrunuBul(senaryoAnahtarVeyaAdi);
    var basariliMi = veri.durum === 'passed';
    var atlandiMi = veri.durum === 'skipped';
    // Kullanıcının "Durdur" ile kestiği koşu (sunucu durum: 'iptal') "Durduruldu"
    // sayılır — başarısız DEĞİL. Sunucunun 10 dk süre limitiyle kestiği koşu
    // ('timedOut') ise testin kendi sorunu olduğundan başarısız kalır.
    var durdurulduMu = veri.durum === 'iptal';
    var basarili = basariliMi ? 1 : 0;
    var basarisiz = !basariliMi && !atlandiMi && !durdurulduMu ? 1 : 0;
    var atlanan = atlandiMi ? 1 : 0;
    var durduruldu = durdurulduMu ? 1 : 0;
    var senaryoKaydi = {
      ad: senaryoAdi,
      durum: basariliMi ? 'basarili' : atlandiMi ? 'atlanan' : durdurulduMu ? 'durduruldu' : 'basarisiz',
      genelMesaj: durdurulduMu ? '' : veri.hataMesaji || '',
      adimlar: []
    };

    // Aynı gruptan (birlikte başlatılmış) bir satır zaten varsa sonuç ona eklenir.
    var grupKimligi = grup && grup.kimlik;
    var mevcutIndex = -1;
    if (grupKimligi) {
      for (var i = VERI.kosuGecmisi.length - 1; i >= 0; i--) {
        if (VERI.kosuGecmisi[i].grup === grupKimligi) { mevcutIndex = i; break; }
      }
    }
    if (mevcutIndex !== -1) {
      var satir = VERI.kosuGecmisi[mevcutIndex];
      satir.basarili += basarili;
      satir.basarisiz += basarisiz;
      satir.atlanan += atlanan;
      satir.durduruldu = (satir.durduruldu || 0) + durduruldu;
      var u = satir.urunler[urun] || (satir.urunler[urun] = { basarili: 0, basarisiz: 0, atlanan: 0, durduruldu: 0 });
      u.basarili += basarili;
      u.basarisiz += basarisiz;
      u.atlanan += atlanan;
      u.durduruldu = (u.durduruldu || 0) + durduruldu;
      var detay = VERI.kosuDetaylari[mevcutIndex];
      (detay[urun] || (detay[urun] = [])).push(senaryoKaydi);
      return true;
    }

    var urunler = {};
    urunler[urun] = { basarili: basarili, basarisiz: basarisiz, atlanan: atlanan, durduruldu: durduruldu };

    VERI.kosuGecmisi.push({
      grup: grupKimligi || null,
      etiket: kosuEtiketiClient(zamanMs),
      etiketKisa: new Date(zamanMs).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }),
      z: zamanMs,
      tur: (grup && grup.tur) || 'tekil',
      kapsam: grup && grup.tur === 'tam' ? grup.kapsam || 'Genel' : null,
      basarili: basarili,
      basarisiz: basarisiz,
      atlanan: atlanan,
      durduruldu: durduruldu,
      urunler: urunler
    });

    var urunSenaryolari = {};
    urunSenaryolari[urun] = [senaryoKaydi];
    VERI.kosuDetaylari.push(urunSenaryolari);
    return true;
  }

  function anlikKosuTarihSinirlariniGenisletGerekirse(zamanMs) {
    ['bitisTarihiKosu', 'bitisTarihiTrend'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var mevcutMs = el.value ? new Date(el.value).getTime() : -Infinity;
      if (zamanMs > mevcutMs) el.value = gunSaatAnahtari(zamanMs + 60000);
    });
  }

  // "Koşu geçmişi"nin kalıcılığı için localStorage'daki basit JSON dizisi: her ortam
  // (TEST/CANLI) kendi anahtarında tutulur, karışmasınlar diye.
  var ANLIK_KOSU_DEPO_ANAHTARI = 'urunHataRaporuAnlikKosular_' + ORTAM;
  // Depo sınırsız büyümesin diye tutulan azami kayıt sayısı — bunu aşan en eski
  // kayıtlar atılır (asıl kalıcı geçmiş zaten bir sonraki "npm run rapor:*" ile
  // gerçek Allure verisinden yeniden üretilir, bu depo sadece ARADAKİ boşluğu doldurur).
  var ANLIK_KOSU_DEPO_MAKS_KAYIT = 300;

  function anlikKosuDepoyuOku() {
    try {
      var ham = localStorage.getItem(ANLIK_KOSU_DEPO_ANAHTARI);
      var liste = ham ? JSON.parse(ham) : [];
      return Array.isArray(liste) ? liste : [];
    } catch (e) {
      return []; // bozuk JSON/gizli sekme vb. — sıfırdan başla
    }
  }

  function anlikKosuDepoyaEkle(senaryoAnahtarVeyaAdi, veri, zamanMs, grup) {
    try {
      var liste = anlikKosuDepoyuOku();
      liste.push({
        // "dosya::ad" anahtarı (yalnızca ad olan eski kayıtlar da okunabilir).
        senaryoAdi: senaryoAnahtarVeyaAdi,
        z: zamanMs,
        grup: grup || null,
        // Ekran görüntüsü/video KASITLI OLARAK depolanmaz (bkz. yukarıdaki NOT).
        veri: { basarili: veri.basarili, durum: veri.durum, hataMesaji: veri.hataMesaji || null }
      });
      if (liste.length > ANLIK_KOSU_DEPO_MAKS_KAYIT) liste = liste.slice(-1 * ANLIK_KOSU_DEPO_MAKS_KAYIT);
      localStorage.setItem(ANLIK_KOSU_DEPO_ANAHTARI, JSON.stringify(liste));
    } catch (e) {
      // localStorage dolu/gizli sekme vb. — yoksay, sadece bu koşu kalıcı olmaz.
    }
  }

  // Sayfa açılışında localStorage'daki depoyu okuyup VERI'ye geri ekler — "Koşu
  // geçmişi" tablosu, sayfa yenilense/kapatılıp açılsa bile en son "npm run rapor:*"ten
  // SONRA dashboard'dan tetiklenen koşuları da göstermeye devam eder.
  //  - Kayıtlar KENDİ (gerçek) zamanlarıyla eklenir (eskiden sayfa açılış anıyla
  //    ekleniyordu; hepsi "şimdi" olmuş gibi görünüyordu).
  //  - Zamanı raporun üretim anından (VERI.uretimMs) önce/eşit olan kayıtlar, o koşuların
  //    Allure sonuçları zaten bu rapora dahil olduğundan ATILIR ve depodan da silinir
  //    (aksi halde "Koşu geçmişi"nde iki kez sayılıyorlardı).
  //  - Ekran burada ÇİZİLMEZ — çağıran (sayfa açılışı) en sonda tek bir secimGuncellendi()
  //    yapar (eskiden her kayıt için tüm ekran yeniden çiziliyordu).
  function anlikKosuDepoyuYukle() {
    var liste = anlikKosuDepoyuOku();
    var uretimMs = Number(VERI.uretimMs) || 0;
    var kalanlar = liste.filter(function (kayit) {
      return kayit && typeof kayit.z === 'number' && kayit.z > uretimMs;
    });
    if (kalanlar.length !== liste.length) {
      try {
        if (kalanlar.length) localStorage.setItem(ANLIK_KOSU_DEPO_ANAHTARI, JSON.stringify(kalanlar));
        else localStorage.removeItem(ANLIK_KOSU_DEPO_ANAHTARI);
      } catch (e) {
        // gizli sekme vb. — yoksay; bir sonraki açılışta yine süzülür.
      }
    }
    var enGecZaman = -Infinity;
    kalanlar
      .slice()
      .sort(function (a, b) { return a.z - b.z; })
      .forEach(function (kayit) {
        if (anlikKosuVeriyeEkle(kayit.senaryoAdi, kayit.veri, kayit.z, kayit.grup) && kayit.z > enGecZaman) enGecZaman = kayit.z;
      });
    if (enGecZaman > -Infinity) anlikKosuTarihSinirlariniGenisletGerekirse(enGecZaman);
  }

  // ---------- Global "çalışan senaryolar" durumu ----------
  // anahtar ("dosya::ad", bkz. senaryoAnahtari) -> { kosuId, durduruluyor }.
  // NOT (kök neden): Çalışan satırın spinner'ı + Durdur butonu eskiden yalnızca o anki
  // DOM satırında tutuluyordu; tablo herhangi bir sebeple yeniden çizilince (başka bir
  // koşunun bitmesi, arama, sayfa/ürün değişimi, tümünü seç) satır ▷'ye dönüyor, Durdur
  // kayboluyor ve aynı senaryo ikinci kez başlatılabiliyordu. Artık "Senaryolar" tablosu
  // ve "Koşu geçmişi" detay penceresindeki ▷'ler bu tek haritadan çizilir; sonuç, satırın
  // DOM'u değişmiş olsa bile anahtar üzerinden uygulanır.
  var CALISAN_SENARYOLAR = new Map();

  function senaryoCalisiyorMu(anahtar) {
    return CALISAN_SENARYOLAR.has(anahtar);
  }

  function calisanSenaryoEkle(anahtar, kosuId) {
    CALISAN_SENARYOLAR.set(anahtar, { kosuId: kosuId, durduruluyor: false });
    calisanSenaryoGorunumleriniGuncelle();
  }

  function calisanSenaryoCikar(anahtar, kosuId) {
    var kayit = CALISAN_SENARYOLAR.get(anahtar);
    // Aynı anahtarla sonradan başlatılmış BAŞKA bir koşunun kaydını silmemek için kosuId eşleşmeli.
    if (kayit && kayit.kosuId === kosuId) CALISAN_SENARYOLAR.delete(anahtar);
    calisanSenaryoGorunumleriniGuncelle();
  }

  // Global Durdur: hangi görünümdeki (tablo / koşu detay penceresi) Durdur'a basılırsa
  // basılsın aynı koşu durdurulur; tüm kopyalar "Durduruluyor..." durumuna geçer.
  function calisanSenaryoyuDurdur(anahtar) {
    var kayit = CALISAN_SENARYOLAR.get(anahtar);
    if (!kayit || kayit.durduruluyor) return;
    kayit.durduruluyor = true;
    senaryoDurdurIstegiGonder(kayit.kosuId);
    calisanSenaryoGorunumleriniGuncelle();
  }

  function calisanDurdurButonuHtml(anahtar) {
    var kayit = CALISAN_SENARYOLAR.get(anahtar);
    var durduruluyor = kayit && kayit.durduruluyor;
    return '<button type="button" class="senaryo-durdur-buton" data-senaryo-durdur="' + escapeHtml(anahtar) + '"' +
      (durduruluyor ? ' disabled title="Durduruluyor..."' : ' title="Durdur"') + ' aria-label="Bu koşuyu durdur">' +
      '<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14"></rect></svg>' +
      '</button>';
  }

  var BASLAT_IKONU_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8V4z"></path></svg>';

  // "Senaryolar" tablosundaki çalıştır hücresinin içeriği: çalışıyorsa spinner + Durdur,
  // değilse ▷.
  function senaryoTablosuCalistirHucresiHtml(anahtar) {
    if (senaryoCalisiyorMu(anahtar)) {
      return '<span class="senaryo-calisan-kontroller"><span class="senaryo-spinner" title="Çalışıyor..."></span>' +
        calisanDurdurButonuHtml(anahtar) + '</span>';
    }
    return '<button type="button" class="senaryo-baslat-buton" data-senaryo-tablosu-baslat title="Bu senaryoyu şimdi çalıştır" aria-label="Bu senaryoyu şimdi çalıştır">' +
      BASLAT_IKONU_SVG + '</button>';
  }

  // Koşu detay penceresindeki ▷ (çalışıyorsa devre dışı + spinner, yanında Durdur).
  function kosuDetayBaslatHtml(anahtar) {
    var calisiyor = senaryoCalisiyorMu(anahtar);
    return '<button type="button" class="senaryo-baslat-buton" data-senaryo-baslat data-senaryo-anahtar="' + escapeHtml(anahtar) + '"' +
      (calisiyor ? ' disabled title="Çalışıyor..."' : ' title="Bu senaryoyu şimdi çalıştır"') + ' aria-label="Bu senaryoyu şimdi çalıştır">' +
      (calisiyor ? '<span class="senaryo-spinner"></span>' : BASLAT_IKONU_SVG) +
      '</button>' +
      (calisiyor ? calisanDurdurButonuHtml(anahtar) : '');
  }

  // Koşu detayındaki senaryo yalnızca ADIYLA bilinir; aynı başlık birden fazla ürün
  // dosyasında olabildiği için önce (ürün + ad) ile TEK eşleşme aranır, bulunursa
  // tablodakiyle aynı "dosya::ad" anahtarı kullanılır (böylece iki görünüm aynı çalışma
  // durumunu paylaşır ve sunucuya dosya da gönderilir). Bulunamazsa yalnızca ad.
  function kosuDetaySenaryoAnahtari(ad, urun) {
    var eslesenler = (VERI.tumSenaryolar || []).filter(function (s) { return s.ad === ad && (!urun || s.urun === urun); });
    if (eslesenler.length !== 1) {
      eslesenler = (VERI.tumSenaryolar || []).filter(function (s) { return s.ad === ad; });
    }
    return eslesenler.length === 1 ? senaryoAnahtari(eslesenler[0]) : ad;
  }

  // Tablo/pencere TAMAMEN yeniden çizilmeden, yalnızca ▷/Durdur hücrelerini global
  // duruma göre günceller (açık durum mesajları, sayfa, seçim vb. bozulmasın diye).
  function calisanSenaryoGorunumleriniGuncelle() {
    Array.prototype.forEach.call(document.querySelectorAll('#senaryoTablosuGovdesi tr[data-senaryo-anahtar]'), function (satir) {
      var anahtar = satir.getAttribute('data-senaryo-anahtar');
      var hucre = satir.querySelector('.senaryo-tablosu-calistir-hucre');
      if (!hucre) return;
      var calisiyor = senaryoCalisiyorMu(anahtar);
      var yeniHtml = senaryoTablosuCalistirHucresiHtml(anahtar);
      if (hucre.innerHTML !== yeniHtml) hucre.innerHTML = yeniHtml;
      satir.classList.toggle('senaryo-satir-calisiyor', calisiyor);
    });
    Array.prototype.forEach.call(document.querySelectorAll('#adimDetayModalIcerik [data-senaryo-baslat]'), function (buton) {
      var anahtar = buton.getAttribute('data-senaryo-anahtar');
      var eskiDurdur = buton.nextElementSibling && buton.nextElementSibling.hasAttribute('data-senaryo-durdur') ? buton.nextElementSibling : null;
      var sablon = document.createElement('span');
      sablon.innerHTML = kosuDetayBaslatHtml(anahtar);
      var yeniButon = sablon.firstChild;
      buton.disabled = yeniButon.disabled;
      buton.title = yeniButon.title;
      buton.innerHTML = yeniButon.innerHTML;
      if (eskiDurdur) eskiDurdur.remove();
      if (sablon.childNodes.length > 1) buton.insertAdjacentElement('afterend', sablon.childNodes[1]);
    });
  }

  // Durdur butonları (tablo + koşu detay penceresi) için tek, belge düzeyinde dinleyici —
  // butonlar yeniden çizilse bile çalışır.
  document.addEventListener('click', function (olay) {
    var durdurButonu = olay.target.closest && olay.target.closest('[data-senaryo-durdur]');
    if (!durdurButonu || durdurButonu.disabled) return;
    calisanSenaryoyuDurdur(durdurButonu.getAttribute('data-senaryo-durdur'));
  });

  // Koşu geçmişi > ürün > senaryo listesindeki ▷ ikonu: sonucu, satırın altına küçük
  // bir mesaj olarak yazar (bu görünümde popup açmaya gerek yok, zaten bir modal içinde).
  // Çalışırken ▷ devre dışı kalır ve yanında "Durdur" ikonu görünür — ikisi de global
  // CALISAN_SENARYOLAR durumundan çizildiği için pencere yeniden çizilse de korunur ve
  // aynı senaryo "Senaryolar" tablosundan ikinci kez başlatılamaz.
  function senaryoBaslat(anahtar, buton) {
    if (!anahtar || senaryoCalisiyorMu(anahtar)) return;
    senaryoDurumGoster(buton, null);

    var kosuId = kosuIdOlustur();
    calisanSenaryoEkle(anahtar, kosuId);

    senaryoCalistirIstegiGonder(anahtar, kosuId).then(function (veri) {
      calisanSenaryoCikar(anahtar, kosuId);
      // Pencere bu arada yeniden çizilmiş olabilir — mesaj GÜNCEL butonun altına yazılır.
      var guncelButon = document.querySelector('#adimDetayModalIcerik [data-senaryo-baslat][data-senaryo-anahtar="' + CSS.escape(anahtar) + '"]') || buton;
      if (veri && veri.basarili) {
        var sure = senaryoSureMetni(veri.sureMs);
        senaryoDurumGoster(guncelButon, {
          basarili: veri.durum === 'passed',
          mesaj: senaryoDurumEtiketi(veri.durum) + (sure ? ' (' + sure + ')' : '') + (veri.hataMesaji ? ' — ' + veri.hataMesaji : '')
        });
        anlikKosuKaydiEkle(anahtar, veri);
      } else {
        senaryoDurumGoster(guncelButon, { basarili: false, mesaj: (veri && veri.mesaj) || 'Başlatılamadı.' });
      }
    });
  }

  // Buton ile aynı satırın hemen altına geçici bir durum mesajı ekler/günceller.
  function senaryoDurumGoster(buton, sonuc) {
    var satir = buton.closest('.kosu-detay-oge');
    if (!satir) return;
    var mevcut = satir.nextElementSibling;
    if (mevcut && mevcut.classList && mevcut.classList.contains('senaryo-durum-mesaji')) {
      mevcut.remove();
    }
    if (!sonuc) return;
    var el = document.createElement('div');
    el.className = 'senaryo-durum-mesaji ' + (sonuc.basarili ? 'basarili' : 'hata');
    el.textContent = sonuc.mesaj;
    satir.insertAdjacentElement('afterend', el);
    if (sonuc.basarili) {
      setTimeout(function () { el.remove(); }, 6000);
    }
  }

  // ---------- "Senaryolar" tablosu (koşu geçmişinden bağımsız, tüm proje) ----------
  var SENARYO_TABLOSU_ARAMA = '';
  // Seçili satırlar burada, checkbox'lardan BAĞIMSIZ olarak (senaryoAdi ile) tutulur —
  // filtre/arama değişip tablo yeniden çizilse bile seçim kaybolmaz.
  var SENARYO_TABLOSU_SECILI = new Set();
  // "Koşuyu başlat" / "Seçilenleri çalıştır" toplu koşu durumu.
  // calisanlar: index -> kosuId (senaryoAdi DEĞİL — aynı başlık birden fazla ürün
  // dosyasında tekrarlanabildiği için, satır bazlı "Durdur" doğru süreci hedefleyebilsin
  // diye her koşuya benzersiz bir kosuId atanır; bkz. kosuIdOlustur).
  var TOPLU_KOSU = { calisiyor: false, iptal: false, calisanlar: new Map() };

  // senaryoTablosuCiz (görünüm) VE "Koşuyu başlat" (hangi senaryoların
  // çalıştırılacağını bilmek için) AYNI filtrelenmiş listeyi kullanır.
  // Aramada Türkçe karakterler ve büyük/küçük harf fark etmesin: "ILK ATES",
  // "ilk ateş" ve "İLK ATEŞ" aynı sonuçları verir.
  function aramaIcinSadelestir(metin) {
    return String(metin)
      .toLocaleLowerCase('tr-TR')
      .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
      .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // ---------- Koşu listesi ("Koşuda" anahtarları) ----------
  // Hangi senaryoların koşuya dahil olduğu tests/data/kosu-listesi.json'da tutulur (rapor
  // üretilirken VERI.tumSenaryolar[i].dahil olarak gömülür). Burada, "dosya::ad"
  // anahtarlarıyla HARİÇ tutulanlar kümesi olarak izlenir. Değişiklikler iyimser (optimistic)
  // uygulanır: anahtar hemen döner, sunucu (/kosu-listesi) reddederse ya da ulaşılamazsa
  // eski değere geri alınır ve kısa bir bildirim gösterilir.
  var KOSU_LISTESI_HARIC = new Set(
    (VERI.tumSenaryolar || []).filter(function (s) { return s.dahil === false; }).map(senaryoAnahtari)
  );
  // Sunucuda sonucu beklenen istek sayısı — hepsi bitince küme sunucunun döndürdüğü
  // (dosyadaki) GERÇEK listeyle eşitlenir (arada yapılan iyimser değişiklikler ezilmesin diye).
  var KOSU_LISTESI_BEKLEYEN_ISTEK = 0;
  var KOSU_LISTESI_BEKLEYEN_ANAHTARLAR = new Set();

  function kosuyaDahilMi(anahtar) {
    return !KOSU_LISTESI_HARIC.has(anahtar);
  }

  // Sunucu "/" ayracıyla normalize edilmiş anahtarlar döner; tablodaki anahtarlar ise
  // "--list" çıktısındaki dosya yolunu (Windows'ta "\") kullanır — eşleştirmek için.
  function kosuListesiAnahtarNormalize(anahtar) {
    var i = anahtar.indexOf(SENARYO_ANAHTAR_AYRACI);
    // Ters eğik çizgiler ("\") "/" yapılır.
    return i > 0 ? anahtar.slice(0, i).replace(/\\/g, '/') + anahtar.slice(i) : anahtar;
  }

  var KOSU_LISTESI_BILDIRIM_ZAMANLAYICI = null;
  function kosuListesiBildirimGoster(mesaj, basariliMi) {
    var el = document.getElementById('kosuListesiBildirim');
    el.textContent = mesaj;
    el.classList.toggle('basarili', !!basariliMi);
    el.hidden = false;
    if (KOSU_LISTESI_BILDIRIM_ZAMANLAYICI) clearTimeout(KOSU_LISTESI_BILDIRIM_ZAMANLAYICI);
    KOSU_LISTESI_BILDIRIM_ZAMANLAYICI = setTimeout(function () { el.hidden = true; }, basariliMi ? 2500 : 6000);
  }

  function kosuListesiIstegiGonder(anahtarlar, dahil) {
    return fetch(TEST_SUNUCU.taban + '/kosu-listesi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ortam: ORTAM, token: TEST_SUNUCU.token, anahtarlar: anahtarlar, dahil: dahil })
    })
      .then(function (yanit) { return yanit.json(); })
      .catch(function () {
        return { basarili: false, mesaj: 'Test sunucusuna ulaşılamadı. Bir terminalde "npm run test-sunucu" çalıştırıp tekrar deneyin.' };
      });
  }

  // anahtarlar: "dosya::ad" listesi; dahil: true (koşuya ekle) / false (koşudan çıkar).
  function kosuListesiniDegistir(anahtarlar, dahil) {
    var degisecekler = anahtarlar.filter(function (a) { return kosuyaDahilMi(a) !== dahil; });
    if (!degisecekler.length) return;
    // İyimser güncelleme — önceki değerler geri alma için saklanır.
    degisecekler.forEach(function (a) {
      if (dahil) KOSU_LISTESI_HARIC.delete(a);
      else KOSU_LISTESI_HARIC.add(a);
      KOSU_LISTESI_BEKLEYEN_ANAHTARLAR.add(a);
    });
    KOSU_LISTESI_BEKLEYEN_ISTEK++;
    senaryoTablosuCiz();
    kosuListesiIstegiGonder(degisecekler, dahil).then(function (sonuc) {
      KOSU_LISTESI_BEKLEYEN_ISTEK--;
      degisecekler.forEach(function (a) { KOSU_LISTESI_BEKLEYEN_ANAHTARLAR.delete(a); });
      if (!sonuc || !sonuc.basarili) {
        // Geri al: yalnızca bu isteğin değiştirdiği anahtarlar eski hâline döner.
        degisecekler.forEach(function (a) {
          if (dahil) KOSU_LISTESI_HARIC.add(a);
          else KOSU_LISTESI_HARIC.delete(a);
        });
        kosuListesiBildirimGoster('Koşu listesi güncellenemedi: ' + ((sonuc && sonuc.mesaj) || 'bilinmeyen hata.'), false);
      } else {
        if (KOSU_LISTESI_BEKLEYEN_ISTEK === 0 && Array.isArray(sonuc.haricTutulanlar)) {
          var sunucuHaric = new Set(sonuc.haricTutulanlar);
          KOSU_LISTESI_HARIC = new Set(
            (VERI.tumSenaryolar || []).map(senaryoAnahtari).filter(function (a) { return sunucuHaric.has(kosuListesiAnahtarNormalize(a)); })
          );
        }
        if (degisecekler.length > 1) {
          kosuListesiBildirimGoster(degisecekler.length + ' senaryo ' + (dahil ? 'koşuya eklendi.' : 'koşudan çıkarıldı.'), true);
        }
      }
      senaryoTablosuCiz();
    });
  }

  function kosudaHucresiHtml(anahtar, ad) {
    var dahilMi = kosuyaDahilMi(anahtar);
    var bekliyor = KOSU_LISTESI_BEKLEYEN_ANAHTARLAR.has(anahtar);
    return '<label class="kosuda-anahtar" title="' + (dahilMi ? 'Koşuya dahil — çıkarmak için tıklayın' : 'Koşudan hariç — eklemek için tıklayın') + '">' +
      '<input type="checkbox" role="switch" class="senaryo-kosuda-anahtari"' + (dahilMi ? ' checked' : '') + (bekliyor ? ' disabled' : '') +
      ' aria-checked="' + (dahilMi ? 'true' : 'false') + '" aria-label="Koşuya dahil: ' + escapeHtml(ad) + '" />' +
      '<span class="kosuda-anahtar-iz" aria-hidden="true"></span></label>';
  }

  function senaryoTablosuFiltrelenmisListeyiGetir() {
    var tumu = VERI.tumSenaryolar || [];
    var genelMi = secilenUrun === GENEL;
    // Soldaki ürün listesinden bir ürün seçiliyse (ör. "JetKasko"), diğer bölümlerle
    // (Hata kalıpları, Koşu geçmişi vb.) tutarlı olsun diye bu tablo da SADECE o
    // ürünün senaryolarını gösterir — GENEL seçiliyken hepsi listelenir.
    var urunSuzulmus = genelMi ? tumu : tumu.filter(function (s) { return s.urun === secilenUrun; });
    var arama = aramaIcinSadelestir(SENARYO_TABLOSU_ARAMA).trim();
    return !arama
      ? urunSuzulmus
      : urunSuzulmus.filter(function (s) {
          return aramaIcinSadelestir(s.ad).indexOf(arama) !== -1 ||
            aramaIcinSadelestir(s.urun).indexOf(arama) !== -1;
        });
  }

  // "Seçilenleri çalıştır"ın GERÇEKTEN çalıştıracağı anahtarlar: yalnızca o an GÖRÜNEN
  // (ürün + arama filtresinden geçen) listede seçili olanlar, halihazırda çalışanlar
  // hariç. NOT (kök neden): eskiden tüm SENARYO_TABLOSU_SECILI çalıştırılıyordu — ürün/
  // arama değişince gizlenen seçimler de koşuyor, butondaki sayı (2) ile koşan sayı (4)
  // tutmuyordu. Buton sayısı, onay penceresi ve koşu artık hep bu listeyi kullanır.
  function seciliCalistirilacakAnahtarlar() {
    return senaryoTablosuFiltrelenmisListeyiGetir()
      .map(senaryoAnahtari)
      .filter(function (anahtar) { return SENARYO_TABLOSU_SECILI.has(anahtar) && !senaryoCalisiyorMu(anahtar); });
  }

  function senaryoTablosuSecimDurumunuGuncelle() {
    var liste = senaryoTablosuFiltrelenmisListeyiGetir();
    var seciliSayisi = 0;
    liste.forEach(function (s) { if (SENARYO_TABLOSU_SECILI.has(senaryoAnahtari(s))) seciliSayisi++; });
    var calistirilacakSayisi = seciliCalistirilacakAnahtarlar().length;

    var tumunuSecCheckbox = document.getElementById('senaryoTumunuSecCheckbox');
    tumunuSecCheckbox.checked = liste.length > 0 && seciliSayisi === liste.length;
    tumunuSecCheckbox.indeterminate = seciliSayisi > 0 && seciliSayisi < liste.length;

    var secilenleriCalistirButonu = document.getElementById('senaryoSecilenleriCalistirButonu');
    // Kullanıcının isteği: sadece BİRDEN FAZLA seçiliyken bu buton görünsün — tek
    // seçimde zaten satırdaki ▷ ikonu var.
    secilenleriCalistirButonu.style.display = calistirilacakSayisi > 1 ? '' : 'none';
    document.getElementById('senaryoSecilenSayisi').textContent = calistirilacakSayisi;

    // "Koşuya ekle / Koşudan çıkar": görünen listede seçili olanlardan durumu değişecek
    // olanların sayısı gösterilir; değişecek bir şey yoksa buton gizlenir.
    var eklenecekler = kosuListesiSeciliAnahtarlar(true).length;
    var cikarilacaklar = kosuListesiSeciliAnahtarlar(false).length;
    document.getElementById('senaryoKosuyaEkleButonu').style.display = eklenecekler ? '' : 'none';
    document.getElementById('senaryoKosuyaEkleSayisi').textContent = eklenecekler;
    document.getElementById('senaryoKosudanCikarButonu').style.display = cikarilacaklar ? '' : 'none';
    document.getElementById('senaryoKosudanCikarSayisi').textContent = cikarilacaklar;
  }

  // Görünen (ürün + arama filtreli) listede seçili olup koşu listesi durumu "dahil"e
  // (hedefDahil=true) ya da "hariç"e (false) göre DEĞİŞECEK olan anahtarlar.
  function kosuListesiSeciliAnahtarlar(hedefDahil) {
    return senaryoTablosuFiltrelenmisListeyiGetir()
      .map(senaryoAnahtari)
      .filter(function (anahtar) { return SENARYO_TABLOSU_SECILI.has(anahtar) && kosuyaDahilMi(anahtar) !== hedefDahil; });
  }

  // "Koşuyu başlat"ın koşacağı liste: görünen listedeki koşuya DAHİL senaryolar
  // (halihazırda çalışanlar hariç).
  function kosuyaDahilGorunenAnahtarlar() {
    return senaryoTablosuFiltrelenmisListeyiGetir()
      .map(senaryoAnahtari)
      .filter(function (anahtar) { return kosuyaDahilMi(anahtar) && !senaryoCalisiyorMu(anahtar); });
  }

  // Senaryonun beklenen sonuç rozeti ("Ödeme", "Teklif", "Hata: Prim" ...) — kaynak,
  // spec'in "beklenenSonuc" annotation'ı (bkz. test-sunucu.mjs > senaryolariListele).
  // Annotation'ı olmayan ürünlerde rozet çizilmez.
  function beklenenSonucRozetiHtml(etiket) {
    if (!etiket) return '';
    var hataMi = /^(Hata|Geçersiz)/.test(etiket);
    var aciklama = hataMi
      ? 'Beklenen sonuç: iş kuralı hatası (uyarı görünürse başarılı sayılır)'
      : etiket === 'Teklif'
        ? 'Beklenen sonuç: teklif oluşur, ödeme adımı koşulmaz'
        : 'Beklenen sonuç: ödeme adımına kadar başarılı akış';
    return ' <span class="rozet rozet-tekil ' + (hataMi ? 'rozet-beklenen-hata' : 'rozet-beklenen') + '" title="' + escapeHtml(aciklama) + '">' + escapeHtml(etiket) + '</span>';
  }

  function senaryoTablosuCiz() {
    var govdeEl = document.getElementById('senaryoTablosuGovdesi');
    var tumu = VERI.tumSenaryolar || [];
    var genelMi = secilenUrun === GENEL;
    var liste = senaryoTablosuFiltrelenmisListeyiGetir();

    document.getElementById('senaryoTablosuBasligi').textContent = genelMi ? 'Senaryolar' : 'Senaryolar — ' + secilenUrun;
    document.getElementById('senaryoTablosuBaslikSayisi').textContent = liste.length;
    document.getElementById('senaryoTablosuSecimOzeti').textContent =
      liste.length !== tumu.length ? liste.length + ' / ' + tumu.length + ' gösteriliyor' : '';

    var dahilSayisi = liste.filter(function (s) { return kosuyaDahilMi(senaryoAnahtari(s)); }).length;
    document.getElementById('senaryoKosudaSayaci').textContent = liste.length ? 'Koşuda: ' + dahilSayisi + ' / ' + liste.length : '';

    var tumunuCalistirButonu = document.getElementById('senaryoTumunuCalistirButonu');
    tumunuCalistirButonu.disabled = dahilSayisi === 0 || TOPLU_KOSU.calisiyor;

    var sayfalamaAlani = document.getElementById('senaryoTablosuSayfalama');

    if (liste.length === 0) {
      govdeEl.innerHTML = '<tr><td colspan="6"><div class="bos-durum">' +
        (tumu.length === 0
          ? 'Senaryo listesi alınamadı — rapor üretilirken "npx playwright test --list" çalıştırılamamış olabilir (terminaldeki "npm run rapor:' + ORTAM + '" çıktısına bakın).'
          : 'Eşleşen senaryo bulunamadı.') +
        '</div></td></tr>';
      sayfalamaAlani.innerHTML = '';
      senaryoTablosuSecimDurumunuGuncelle();
      return;
    }

    // Sayfalama: "Koşu geçmişi" tablosuyla aynı mantık/görünüm. Seçim (SENARYO_TABLOSU_SECILI)
    // sayfadan bağımsız (senaryoAdi ile) tutulduğu için 1. sayfada seçip 2. sayfaya
    // geçmek seçimi KAYBETMEZ — "Seçilenleri çalıştır" tüm sayfalardaki seçimi kapsar.
    var toplamSayfa = Math.max(1, Math.ceil(liste.length / SENARYO_TABLOSU_SAYFA_BOYUTU));
    if (senaryoTablosuSayfa > toplamSayfa) senaryoTablosuSayfa = toplamSayfa;
    if (senaryoTablosuSayfa < 1) senaryoTablosuSayfa = 1;
    var baslangicIdx = (senaryoTablosuSayfa - 1) * SENARYO_TABLOSU_SAYFA_BOYUTU;
    var sayfaListesi = liste.slice(baslangicIdx, baslangicIdx + SENARYO_TABLOSU_SAYFA_BOYUTU);

    govdeEl.innerHTML = sayfaListesi.map(function (s) {
      var seciliMi = SENARYO_TABLOSU_SECILI.has(senaryoAnahtari(s));
      var dahilMi = kosuyaDahilMi(senaryoAnahtari(s));
      return (
        '<tr data-senaryo-ad="' + escapeHtml(s.ad) + '" data-senaryo-anahtar="' + escapeHtml(senaryoAnahtari(s)) + '"' + (dahilMi ? '' : ' class="senaryo-satir-haric"') + '>' +
        '<td class="senaryo-tablosu-secim-hucre"><input type="checkbox" class="senaryo-tablosu-secim-kutusu"' + (seciliMi ? ' checked' : '') + ' aria-label="Bu senaryoyu seç" /></td>' +
        '<td class="senaryo-tablosu-urun">' + escapeHtml(s.urun) + '</td>' +
        '<td class="senaryo-tablosu-ad">' + escapeHtml(s.ad) + beklenenSonucRozetiHtml(s.beklenenSonuc) + (dahilMi ? '' : ' <span class="rozet rozet-notr rozet-tekil" title="Koşu listesinde değil — Koşuyu başlat ve npm run test bu senaryoyu koşmaz">hariç</span>') + '</td>' +
        '<td class="senaryo-tablosu-kosuda-hucre">' + kosudaHucresiHtml(senaryoAnahtari(s), s.ad) + '</td>' +
        // Çalışan satırlar (global CALISAN_SENARYOLAR) yeniden çizimde de spinner + Durdur gösterir.
        '<td class="senaryo-tablosu-calistir-hucre">' + senaryoTablosuCalistirHucresiHtml(senaryoAnahtari(s)) + '</td>' +
        '<td class="senaryo-tablosu-duzenle-hucre"><button type="button" class="senaryo-duzenle-buton" data-senaryo-duzenle aria-label="Senaryoyu düzenle: ' + escapeHtml(s.ad) + '" title="Senaryoyu düzenle">✎ Düzenle</button></td>' +
        '</tr>'
      );
    }).join('');
    Array.prototype.forEach.call(govdeEl.querySelectorAll('tr[data-senaryo-anahtar]'), function (satir) {
      satir.classList.toggle('senaryo-satir-calisiyor', senaryoCalisiyorMu(satir.getAttribute('data-senaryo-anahtar')));
    });

    // ▷ tıklaması tbody üzerinde tek dinleyiciyle (delegation) yakalanır — hücreler
    // calisanSenaryoGorunumleriniGuncelle ile yerinde değiştirildiğinde de çalışsın diye.
    govdeEl.onclick = function (olay) {
      var duzenleButonu = olay.target.closest('[data-senaryo-duzenle]');
      if (duzenleButonu) {
        senaryoDuzenleAc(duzenleButonu.closest('tr').getAttribute('data-senaryo-anahtar'));
        return;
      }
      var buton = olay.target.closest('[data-senaryo-tablosu-baslat]');
      if (!buton || buton.disabled) return;
      var anahtar = buton.closest('tr').getAttribute('data-senaryo-anahtar');
      if (senaryoCalisiyorMu(anahtar)) return;
      // Tek bir senaryoyu de "Seçilenleri çalıştır" ile AYNI canlı panel/popup
      // deneyimiyle (durum ikonu, canlı ekran görüntüsü izleme, kendi Durdur
      // ikonu, kapatınca sağ-altta rozet) çalıştırır — kullanıcı isteği: tek/çoklu
      // koşu arasında fark olmasın.
      topluKosuBaslat([anahtar], true);
    };

    Array.prototype.forEach.call(govdeEl.querySelectorAll('.senaryo-kosuda-anahtari'), function (anahtarKutusu) {
      anahtarKutusu.addEventListener('change', function () {
        var anahtar = anahtarKutusu.closest('tr').getAttribute('data-senaryo-anahtar');
        kosuListesiniDegistir([anahtar], anahtarKutusu.checked);
      });
    });

    Array.prototype.forEach.call(govdeEl.querySelectorAll('.senaryo-tablosu-secim-kutusu'), function (kutu) {
      kutu.addEventListener('change', function () {
        var satir = kutu.closest('tr');
        var anahtar = satir.getAttribute('data-senaryo-anahtar');
        if (kutu.checked) SENARYO_TABLOSU_SECILI.add(anahtar);
        else SENARYO_TABLOSU_SECILI.delete(anahtar);
        senaryoTablosuSecimDurumunuGuncelle();
      });
    });

    sayfalamaAlani.innerHTML =
      '<button type="button" id="senaryoTablosuOnceki"' + (senaryoTablosuSayfa <= 1 ? ' disabled' : '') + '>Önceki</button>' +
      '<span class="sayfa-bilgi">Sayfa ' + senaryoTablosuSayfa + ' / ' + toplamSayfa + '</span>' +
      '<button type="button" id="senaryoTablosuSonraki"' + (senaryoTablosuSayfa >= toplamSayfa ? ' disabled' : '') + '>Sonraki</button>';
    var oncekiDugme = document.getElementById('senaryoTablosuOnceki');
    var sonrakiDugme = document.getElementById('senaryoTablosuSonraki');
    if (oncekiDugme) oncekiDugme.addEventListener('click', function () { senaryoTablosuSayfa--; senaryoTablosuCiz(); });
    if (sonrakiDugme) sonrakiDugme.addEventListener('click', function () { senaryoTablosuSayfa++; senaryoTablosuCiz(); });

    senaryoTablosuSecimDurumunuGuncelle();
  }

  // Senaryoyu çalıştırır; çalıştığı sürece global CALISAN_SENARYOLAR'a kaydedilir —
  // "Senaryolar" tablosundaki satır (DOM'da olsun ya da olmasın, sonradan kaç kez
  // yeniden çizilirse çizilsin) spinner + Durdur gösterir. Sonuç gelince kayıt silinir
  // ve sonuç anahtar üzerinden uygulanır (satırın eski DOM düğümüne bağlı DEĞİL).
  // "gosterPopup" true ise sonuç popup'ı açılır; toplu koşularda (topluKosuBaslat) false
  // geçilir — 87 senaryo art arda 87 popup açmasın diye. Sonucu her zaman "Koşu
  // geçmişi"ne ekler. Bir Promise döner ki toplu koşu fonksiyonları bekleyebilsin.
  // kosuId çağıran (topluKosuBaslat > birTaneCalistir) tarafından üretilip geçirilir —
  // canlı panelin kendi Durdur ikonuyla AYNI koşuyu hedeflesin diye.
  function senaryoTablosuCalistir(anahtar, secenekler, kosuId) {
    var gosterPopup = !secenekler || secenekler.gosterPopup !== false;
    calisanSenaryoEkle(anahtar, kosuId);
    var gorunenAd = senaryoAnahtarCoz(anahtar).ad;
    return senaryoCalistirIstegiGonder(anahtar, kosuId, secenekler && secenekler.ekAlanlar).then(function (veri) {
      // Önce çalışma kaydı silinir ki anlikKosuKaydiEkle'nin tetiklediği yeniden çizimde
      // satır ▷'ye dönsün.
      calisanSenaryoCikar(anahtar, kosuId);
      if (gosterPopup) senaryoSonucPopupGoster(gorunenAd, veri);
      var ek = secenekler && secenekler.ekAlanlar;
      anlikKosuKaydiEkle(anahtar, veri, true, ek ? { kimlik: ek.kosuKimligi, tur: ek.kosuTuru, kapsam: ek.kosuKapsami || null } : null);
      return veri;
    });
  }

  function senaryoTabloDisindaCalistir(anahtar, kosuId, ekAlanlar) {
    return senaryoTablosuCalistir(anahtar, { gosterPopup: false, ekAlanlar: ekAlanlar }, kosuId);
  }

  function canliPanelSatirIdGetir(index) {
    return 'canliPanelSatir' + index;
  }

  // index -> { zamanlayici, sonUrl } — bir satır çalışırken açılan canlı ekran görüntüsü
  // sorgulama (polling) döngüsünü tutar. Satır bitince (canliPanelSatirBitir) veya panel
  // kapanınca durdurulup temizlenir.
  var CANLI_IZLEME_POLL = {};
  // index -> { ad, kosuId }, o an "çalışıyor" durumunda olan satırlar — panel kapatılıp
  // küçük rozetten tekrar açılınca hangi satırların canlı görüntü sorgulamasını
  // (bkz. canliPanelIzlemeyiBaslat) yeniden başlatması gerektiğini bilmek için.
  var CANLI_PANEL_CALISAN_INDEXLER = {};

  function canliPanelIzlemeyiDurdur(index) {
    var kayit = CANLI_IZLEME_POLL[index];
    if (!kayit) return;
    clearInterval(kayit.zamanlayici);
    if (kayit.sonUrl) URL.revokeObjectURL(kayit.sonUrl);
    delete CANLI_IZLEME_POLL[index];
  }

  // Bir senaryo çalışırken satırın detay alanına 1-1.5 saniyede bir güncellenen bir
  // ekran görüntüsü akıtır — kullanıcı ayrı bir Chrome penceresi görmeden, panel
  // içindeki satıra tıklayıp testi "canlı" izleyebilsin diye (bkz. test-sunucu.mjs
  // > /canli ve fixtures.ts > canliIzlemeYayini).
  function canliPanelIzlemeyiBaslat(index, ad, kosuId) {
    canliPanelIzlemeyiDurdur(index);
    var satir = document.getElementById(canliPanelSatirIdGetir(index));
    if (!satir) return;
    var img = satir.querySelector('.canli-panel-canli-goruntu');
    if (!img) return;

    function birTikSorgula() {
      var url =
        TEST_SUNUCU.taban + '/canli?token=' + encodeURIComponent(TEST_SUNUCU.token) +
        '&kosuId=' + encodeURIComponent(kosuId);
      fetch(url)
        .then(function (yanit) {
          if (!yanit.ok) return null;
          return yanit.blob();
        })
        .then(function (blob) {
          if (!blob) return;
          var guncelSatir = document.getElementById(canliPanelSatirIdGetir(index));
          var guncelImg = guncelSatir && guncelSatir.querySelector('.canli-panel-canli-goruntu');
          if (!guncelImg) return;
          var yeniUrl = URL.createObjectURL(blob);
          var eskiUrl = CANLI_IZLEME_POLL[index] && CANLI_IZLEME_POLL[index].sonUrl;
          guncelImg.src = yeniUrl;
          if (CANLI_IZLEME_POLL[index]) CANLI_IZLEME_POLL[index].sonUrl = yeniUrl;
          if (eskiUrl) URL.revokeObjectURL(eskiUrl);
        })
        .catch(function () {
          // Sunucuya erişilemedi/koşu henüz görüntü üretmedi — bir sonraki tikte tekrar denenir.
        });
    }

    CANLI_IZLEME_POLL[index] = { zamanlayici: setInterval(birTikSorgula, 1200), sonUrl: null };
    birTikSorgula();
  }

  function senaryoDurumIkonSinifi(veri) {
    if (!veri || !veri.basarili) return 'basarisiz';
    if (veri.durum === 'passed') return 'basarili';
    if (veri.durum === 'skipped' || veri.durum === 'iptal') return 'notr';
    return 'basarisiz';
  }

  function senaryoDurumIkonHarfi(sinif) {
    if (sinif === 'basarili') return '✓';
    if (sinif === 'basarisiz') return '✕';
    return '–';
  }

  // Toplu koşu başlarken TÜM senaryoları "bekliyor" durumunda listeleyen paneli açar —
  // kullanıcının isteği: seçtikleri alt alta görünsün, her biri bitince yeşil/kırmızı
  // yansın, tıklayınca o senaryonun ekran görüntüsünü/videosunu görsün.
  function canliPanelAc(senaryolar) {
    Object.keys(CANLI_IZLEME_POLL).forEach(function (index) { canliPanelIzlemeyiDurdur(index); });
    CANLI_PANEL_CALISAN_INDEXLER = {};

    var listeEl = document.getElementById('senaryoCanliPanelListesi');
    listeEl.innerHTML = senaryolar.map(function (ad, i) {
      return (
        '<div class="canli-panel-satir" id="' + canliPanelSatirIdGetir(i) + '" data-senaryo-ad="' + escapeHtml(ad) + '">' +
        '<div class="canli-panel-satir-ust">' +
        '<span class="canli-panel-durum-ikon bekliyor">…</span>' +
        '<span class="canli-panel-satir-ad">' + escapeHtml(ad) + '</span>' +
        '<span class="canli-panel-sure"></span>' +
        '</div>' +
        '<div class="canli-panel-detay"></div>' +
        '</div>'
      );
    }).join('');

    document.getElementById('senaryoCanliPanelBaslik').textContent = 'Senaryolar çalışıyor...';
    document.getElementById('senaryoCanliPanelAltBaslik').textContent = '0 / ' + senaryolar.length + ' tamamlandı';
    var durdurButonu = document.getElementById('senaryoCanliPanelDurdurButonu');
    durdurButonu.style.display = '';
    durdurButonu.disabled = false;
    document.getElementById('senaryoCanliPanelOrtu').classList.add('acik');
    // Yeni bir koşu başladı — panel zaten açık olduğundan küçük rozete gerek yok,
    // ama bundan sonra panel kapatılırsa rozet gösterilebilir hale gelir.
    CANLI_PANEL_ROZET_GORUNSUN = true;
    canliPanelRozetGizle();

    // Satırlar EN BAŞTAN (henüz "bekliyor" durumundayken) tıklanabilir — kullanıcı bir
    // senaryo çalışmaya başlar başlamaz üzerine tıklayıp canlı izlemeye geçebilsin diye.
    // Tek bir olay dinleyicisi (delegation) tüm satırları kapsar, her satır yeniden
    // çizilmeden hayatta kalır.
    listeEl.onclick = function (olay) {
      if (olay.target.closest('video') || olay.target.closest('.video-baglanti') || olay.target.closest('.hata-goruntu') || olay.target.closest('.canli-panel-canli-goruntu') || olay.target.closest('.senaryo-durdur-buton')) return;
      var satir = olay.target.closest('.canli-panel-satir');
      if (!satir) return;
      satir.classList.toggle('acik');
    };
  }

  function canliPanelSatirCalisiyorGoster(index, ad, kosuId) {
    var satir = document.getElementById(canliPanelSatirIdGetir(index));
    if (!satir) return;
    satir.querySelector('.canli-panel-durum-ikon').outerHTML =
      '<span class="canli-panel-durum-ikon"><span class="senaryo-spinner" style="width:12px;height:12px;border-width:2px;"></span></span>';

    // Her satir KENDI "Durdur" ikonunu alir - kullanici hangi satirdakine tiklarsa
    // SADECE o senaryo durur, ustteki "Tumunu durdur" gibi tum kosuyu etkilemez.
    // NOT (4. kök neden — satır Durdur'un takılması): burada ÖNCEDEN senaryoAdi (ad)
    // gönderiliyordu; aynı başlık başka bir ürün dosyasında da varsa sunucu tarafındaki
    // calisanSurecler kaydı ikisi arasında paylaşılıp EZİLİYORDU, bu satırın gerçek süreci
    // hiç ölmüyor ve buton sonsuza dek "Durduruluyor..." kalıyordu. Artık bu koşuya özel
    // kosuId gönderiliyor (bkz. birTaneCalistir > kosuIdOlustur).
    var sureEl = satir.querySelector('.canli-panel-sure');
    if (sureEl && !satir.querySelector('.senaryo-durdur-buton')) {
      var satirDurdurButonu = senaryoDurdurButonuOlustur();
      satirDurdurButonu.title = 'Bu kosuyu durdur';
      satirDurdurButonu.addEventListener('click', function (olay) {
        olay.stopPropagation();
        satirDurdurButonu.disabled = true;
        satirDurdurButonu.title = 'Durduruluyor...';
        senaryoDurdurIstegiGonder(kosuId);
      });
      sureEl.insertAdjacentElement('afterend', satirDurdurButonu);
    }
    CANLI_PANEL_CALISAN_INDEXLER[index] = { ad: ad, kosuId: kosuId };

    // Satır henüz "çalışıyor" durumundayken, tıklanınca canlı ekran görüntüsünü
    // gösterecek detay alanını şimdiden hazırlar ve sorgulamayı (polling) başlatır —
    // kullanıcı satıra tıkladığı an görüntü zaten akıyor olsun diye.
    var detayEl = satir.querySelector('.canli-panel-detay');
    detayEl.innerHTML =
      '<p class="canli-panel-canli-etiket"><span class="canli-panel-canli-nokta"></span>Canlı izleniyor</p>' +
      '<img class="canli-panel-canli-goruntu" alt="' + escapeHtml(ad) + ' - canlı görüntü" />';
    canliPanelIzlemeyiBaslat(index, ad, kosuId);
  }

  // Bir senaryo bitince satırı yeşile/kırmızıya çevirir, süresini yazar ve — varsa —
  // tıklanınca açılan bir detay alanına son ekran görüntüsünü + koşu videosu için
  // "▶ Videoyu izle" bağlantısını (yeni sekmede, test sunucusunun /medya ucundan) ekler.
  // Video artık sayfaya <video> olarak gömülmüyor (kullanıcı kararı).
  function canliPanelSatirBitir(index, ad, veri) {
    canliPanelIzlemeyiDurdur(index);
    var satir = document.getElementById(canliPanelSatirIdGetir(index));
    if (!satir) return;
    var sinif = senaryoDurumIkonSinifi(veri);
    satir.querySelector('.canli-panel-durum-ikon').outerHTML =
      '<span class="canli-panel-durum-ikon ' + sinif + '">' + senaryoDurumIkonHarfi(sinif) + '</span>';
    satir.querySelector('.canli-panel-sure').textContent = veri && veri.sureMs ? senaryoSureMetni(veri.sureMs) : '';
    // Kosu bitti - artik durduracak bir sey kalmadigi icin satirin kendi Durdur
    // ikonu kaldirilir.
    var satirDurdurButonu = satir.querySelector('.senaryo-durdur-buton');
    if (satirDurdurButonu) satirDurdurButonu.remove();
    delete CANLI_PANEL_CALISAN_INDEXLER[index];

    var detayHtml = '';
    if (!veri || !veri.basarili) {
      detayHtml = '<pre class="hata-mesaj">' + escapeHtml((veri && veri.mesaj) || 'Çalıştırılamadı.') + '</pre>';
    } else {
      if (veri.durum === 'iptal') {
        detayHtml += '<div class="bos-durum">Bu koşu durduruldu.</div>';
      } else if (veri.hataMesaji) {
        detayHtml += '<pre class="hata-mesaj">' + escapeHtml(veri.hataMesaji) + '</pre>';
      } else if (veri.mesaj && veri.durum !== 'passed') {
        detayHtml += '<pre class="hata-mesaj">' + escapeHtml(veri.mesaj) + '</pre>';
      }
      if (ekranGoruntusuKaynagi(veri)) {
        detayHtml += '<img class="hata-goruntu" src="' + escapeHtml(ekranGoruntusuKaynagi(veri)) + '" alt="' + escapeHtml(ad) + '" />';
      }
      detayHtml += videoBaglantisiHtml(veri.videoUrl);
    }

    var detayEl = satir.querySelector('.canli-panel-detay');
    detayEl.innerHTML = detayHtml || '<div class="bos-durum">Gösterilecek ek bilgi yok.</div>';
    satir.classList.add('canli-panel-satir-bittiyse');
    // Tıklama zaten canliPanelAc'ta listeEl üzerinde delegation ile bağlandı — burada
    // ayrıca dinleyici eklemeye gerek yok (satır zaten en baştan tıklanabilirdi).
  }

  function canliPanelIlerlemeGuncelle(tamamlanan, toplam) {
    document.getElementById('senaryoCanliPanelAltBaslik').textContent = tamamlanan + ' / ' + toplam + ' tamamlandı';
    canliPanelRozetDurumunuGuncelle();
  }

  function canliPanelBitir(basarili, basarisiz, atlanan, calistirilamadi, iptalEdildiMi) {
    document.getElementById('senaryoCanliPanelBaslik').textContent = iptalEdildiMi ? 'Durduruldu' : 'Tamamlandı';
    document.getElementById('senaryoCanliPanelAltBaslik').textContent =
      basarili + ' başarılı, ' + basarisiz + ' başarısız' +
      (atlanan ? ', ' + atlanan + ' atlandı' : '') +
      (calistirilamadi ? ', ' + calistirilamadi + ' çalıştırılamadı' : '');
    document.getElementById('senaryoCanliPanelDurdurButonu').style.display = 'none';
    canliPanelRozetDurumunuGuncelle();
  }

  // Panel kapatılınca (X ikonu, dışarı tıklama veya Escape) TAMAMEN kaybolmasın diye:
  // en son "Koşuyu başlat"/"Seçilenleri çalıştır" ile en az bir koşu başlatıldıysa
  // (CANLI_PANEL_ROZET_GORUNSUN), sağ altta küçük bir rozet belirir — üzerine tıklanınca
  // panel (o an çalışıyor olsun ya da bitmiş olsun) aynı içerikle tekrar açılır.
  var CANLI_PANEL_ROZET_GORUNSUN = false;

  function canliPanelRozetDurumunuGuncelle() {
    var rozet = document.getElementById('canliPanelKucukRozet');
    if (!rozet) return;
    var baslik = document.getElementById('senaryoCanliPanelBaslik').textContent;
    var altBaslik = document.getElementById('senaryoCanliPanelAltBaslik').textContent;
    document.getElementById('canliPanelKucukRozetMetin').textContent = baslik + (altBaslik ? ' — ' + altBaslik : '');
    document.getElementById('canliPanelKucukRozetSpinner').style.display = TOPLU_KOSU.calisiyor ? '' : 'none';
  }

  function canliPanelRozetGoster() {
    if (!CANLI_PANEL_ROZET_GORUNSUN) return;
    canliPanelRozetDurumunuGuncelle();
    document.getElementById('canliPanelKucukRozet').style.display = 'flex';
  }

  function canliPanelRozetGizle() {
    document.getElementById('canliPanelKucukRozet').style.display = 'none';
  }

  function senaryoCanliPanelKapat() {
    document.getElementById('senaryoCanliPanelOrtu').classList.remove('acik');
    canliPanelRozetGoster();
    // Panel kapanınca hâlâ çalışan satırlar varsa bile canlı görüntü sorgulamasını
    // durdur — arka planda gereksiz istek atılmasın.
    Object.keys(CANLI_IZLEME_POLL).forEach(function (index) { canliPanelIzlemeyiDurdur(index); });
  }

  // "Koşuyu başlat" SIRAYLA çalışır (bir bitmeden diğeri başlamaz) —
  // düzinelerce senaryoyu (bazı ürünlerde 80'i aşkın) aynı anda paralel çalıştırmak
  // hem makineyi hem de testlerin paylaştığı acente/kullanıcı oturumunu (bkz.
  // playwright.config.ts'teki fullyParallel:false notu) karıştırır. "Seçilenleri
  // çalıştır" ise kullanıcının BİLİNÇLİ OLARAK seçtiği (genelde küçük) bir grup
  // olduğu için, kullanıcının isteği doğrultusunda AYNI ANDA (paralel) çalışır.
  // kapsam: 'Genel' ya da ürün adı — yalnızca tam koşularda sunucuya "kosuKapsami" olarak
  // gönderilir (bkz. fixtures.ts > kosuKapsami etiketi, ürün kartları/trend hesabı).
  function topluKosuBaslat(senaryolar, esZamanliMi, tamKosuMu, kapsam) {
    // Onay penceresi açıkken başka bir yerden başlatılmış olabilecek senaryolar atlanır
    // (aynı senaryo iki kez koşmasın).
    senaryolar = senaryolar.filter(function (anahtar) { return !senaryoCalisiyorMu(anahtar); });
    if (TOPLU_KOSU.calisiyor || !senaryolar.length) return;
    TOPLU_KOSU.calisiyor = true;
    TOPLU_KOSU.iptal = false;
    TOPLU_KOSU.calisanlar = new Map();
    // Tam koşu: tüm senaryolar aynı kosuKimligi ile 'tam' olarak etiketlenir; bitince rapor
    // yeniden üretilir ve üst kartlar bu koşuyla güncellenir.
    // Kısmi koşular (seçilenler, ürüne/aramaya daraltılmış liste, tek ▷) da ortak bir
    // kimlik alır; koşu geçmişinde tek bir "tekil" satır olarak toplanırlar.
    var ekAlanlar = { kosuTuru: tamKosuMu ? 'tam' : 'tekil', kosuKimligi: 'dashboard-' + kosuIdOlustur() };
    if (tamKosuMu) ekAlanlar.kosuKapsami = kapsam || 'Genel';

    var toplam = senaryolar.length;
    var tamamlanan = 0;
    var basarili = 0, basarisiz = 0, atlanan = 0, calistirilamadi = 0;

    // senaryolar "dosya::ad" anahtarlarıdır; panelde yalnızca ad gösterilir.
    var gorunenAdlar = senaryolar.map(function (anahtar) { return senaryoAnahtarCoz(anahtar).ad; });
    canliPanelAc(gorunenAdlar);
    senaryoTablosuCiz(); // "Koşuyu başlat" butonunu devre dışı bırakmak için

    function birTaneCalistir(ad, index) {
      // kosuId: bu TEKİL koşuya özel benzersiz kimlik — aynı başlık (ad) başka bir
      // ürün dosyasında da seçilmiş olabileceğinden, satırın kendi Durdur ikonunun ve
      // canlı izlemenin doğru süreci hedeflemesi için "ad" yerine bu kullanılır.
      var kosuId = kosuIdOlustur();
      var anahtar = ad;
      ad = gorunenAdlar[index];
      TOPLU_KOSU.calisanlar.set(index, kosuId);
      canliPanelSatirCalisiyorGoster(index, ad, kosuId);
      return senaryoTabloDisindaCalistir(anahtar, kosuId, ekAlanlar).then(function (veri) {
        TOPLU_KOSU.calisanlar.delete(index);
        tamamlanan++;
        canliPanelSatirBitir(index, ad, veri);
        canliPanelIlerlemeGuncelle(tamamlanan, toplam);

        if (!veri || !veri.basarili) calistirilamadi++;
        else if (veri.durum === 'passed') basarili++;
        else if (veri.durum === 'skipped') atlanan++;
        else if (veri.durum !== 'iptal') basarisiz++;
        return veri;
      });
    }

    var bittiMi = false;
    function bitir() {
      if (bittiMi) return;
      bittiMi = true;
      TOPLU_KOSU.calisiyor = false;
      senaryoTablosuCiz();
      canliPanelBitir(basarili, basarisiz, atlanan, calistirilamadi, TOPLU_KOSU.iptal);
      // Her koşudan sonra rapor yeniden üretilir: adım/ürün tabloları, hata kalıpları ve
      // (tam koşuysa) kartlar ancak Allure sonuçlarından yeniden hesaplanınca güncellenir.
      kosuSonrasiRaporuGuncelle();
    }

    if (esZamanliMi) {
      // Bir koşuda beklenmeyen bir hata olsa bile toplu koşu kilitli kalmasın diye
      // bitir() her durumda çağrılır.
      Promise.all(senaryolar.map(function (ad, i) { return birTaneCalistir(ad, i); })).then(bitir, bitir);
    } else {
      (function siradaki(i) {
        if (i >= senaryolar.length || TOPLU_KOSU.iptal) {
          bitir();
          return;
        }
        birTaneCalistir(senaryolar[i], i).then(
          function () { siradaki(i + 1); },
          function () { siradaki(i + 1); }
        );
      })(0);
    }
  }

  // Toplu koşuyu durdurur: sıradaki senaryoların başlamasını engeller VE o an
  // fiilen çalışmakta olan her senaryo için sunucuya ayrı ayrı /durdur isteği yollar
  // (eş zamanlı modda birden fazla senaryo aynı anda çalışıyor olabilir).
  // Birden fazla senaryoyu tek tıkla başlatmadan önce sayfa içi onay ister: kaç
  // senaryonun, hangi ortamda ve nasıl (sırayla / aynı anda) koşacağı gösterilir.
  var TOPLU_KOSU_ONAY_BEKLEYEN = null;
  // secenekler (yalnızca "Koşuyu başlat" için): { kosuMu, tamKosuMu, kapsam, aramaVarMi,
  // haricSayisi }. "Seçilenleri çalıştır" seçeneksiz çağırır (kısmi/tekil koşu).
  function topluKosuOnayiIste(senaryolar, esZamanliMi, secenekler) {
    if (TOPLU_KOSU.calisiyor || !senaryolar.length) return;
    var sec = secenekler || {};
    var tamKosuMu = !!sec.tamKosuMu;
    TOPLU_KOSU_ONAY_BEKLEYEN = { senaryolar: senaryolar, esZamanliMi: esZamanliMi, tamKosuMu: tamKosuMu, kapsam: sec.kapsam || 'Genel' };
    var canliMi = String(ORTAM) === 'canli';
    var ortamHtml = '<strong' + (canliMi ? ' class="toplu-onay-canli"' : '') + '>' + escapeHtml(String(ORTAM).toUpperCase()) + '</strong>';
    var metin;
    var not;
    if (sec.kosuMu) {
      document.getElementById('topluKosuOnayBaslik').textContent = 'Koşuyu başlat?';
      metin = '<strong>' + senaryolar.length + ' senaryo</strong> (' + escapeHtml(sec.kapsam || 'Genel') + ') koşusu, ' + ortamHtml + ' ortamında sırayla çalıştırılacak.';
      if (sec.haricSayisi) {
        metin += '<br><span class="toplu-onay-not">' + sec.haricSayisi + ' senaryo koşu listesinde olmadığı için dahil edilmedi.</span>';
      }
      if (sec.aramaVarMi) {
        not = 'Arama filtresi etkin: yalnızca aramayla eşleşenler koşar. Bu yüzden kısmi (tekil) koşu olarak kaydedilir; üst kartları ve trendi DEĞİŞTİRMEZ, koşu geçmişinde "tekil" görünür.';
      } else if ((sec.kapsam || 'Genel') === 'Genel') {
        not = 'Koşu olarak kaydedilir; bitince Genel kartlar, Genel trend ve koşulan her ürünün kartları güncellenir.';
      } else {
        not = 'Koşu olarak kaydedilir; bitince ' + escapeHtml(sec.kapsam) + ' kartları ve trendi güncellenir (Genel kartlarda da ' + escapeHtml(sec.kapsam) + ' kısmı yenilenir; Genel trend değişmez).';
      }
    } else {
      document.getElementById('topluKosuOnayBaslik').textContent = 'Toplu koşuyu başlat?';
      metin = '<strong>' + senaryolar.length + ' senaryo</strong>, ' + ortamHtml + ' ortamında ' + (esZamanliMi ? 'aynı anda' : 'sırayla') + ' çalıştırılacak.';
      not = tamKosuMu
        ? 'Koşu olarak kaydedilir; bitince üst kartlar bu koşuyla güncellenir.'
        : 'Kısmi koşu olarak kaydedilir; üst kartları değiştirmez, koşu geçmişinde "tekil" görünür.';
    }
    document.getElementById('topluKosuOnayMetni').innerHTML =
      metin +
      (canliMi ? '<br><span class="toplu-onay-canli">Dikkat: CANLI ortamda gerçek işlem oluşturabilir.</span>' : '') +
      '<br><span class="toplu-onay-not">' + not + '</span>';
    document.getElementById('topluKosuOnayOrtu').classList.add('acik');
    document.getElementById('topluKosuOnayBaslat').focus();
  }
  function topluKosuOnayKapat() {
    TOPLU_KOSU_ONAY_BEKLEYEN = null;
    document.getElementById('topluKosuOnayOrtu').classList.remove('acik');
  }

  // Koşu bitince sunucudan raporu yeniden üretmesini ister; üretim bitince sayfayı
  // yenilemek için panelde bir buton gösterir (panel kapalıysa sayfa doğrudan yenilenir).
  function kosuSonrasiRaporuGuncelle() {
    var altBaslik = document.getElementById('senaryoCanliPanelAltBaslik');
    var ozet = altBaslik.textContent;
    altBaslik.textContent = ozet + ' — tablolar güncelleniyor...';
    fetch(TEST_SUNUCU.taban + '/rapor-uret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ortam: ORTAM, token: TEST_SUNUCU.token })
    })
      .then(function (yanit) { return yanit.json(); })
      .catch(function () { return { basarili: false, mesaj: 'Test sunucusuna ulaşılamadı.' }; })
      .then(function (veri) {
        if (!veri || !veri.basarili) {
          altBaslik.textContent = ozet + ' — tablolar güncellenemedi (terminalde "npm run rapor:' + ORTAM + '" çalıştırın).';
          canliPanelRozetDurumunuGuncelle();
          return;
        }
        if (!document.getElementById('senaryoCanliPanelOrtu').classList.contains('acik')) {
          location.reload();
          return;
        }
        altBaslik.textContent = ozet + ' — tablolar güncellendi. ';
        var yenile = document.createElement('button');
        yenile.type = 'button';
        yenile.className = 'senaryo-toplu-buton senaryo-toplu-buton-vurgulu';
        yenile.textContent = '↻ Sayfayı yenile';
        yenile.addEventListener('click', function () { location.reload(); });
        altBaslik.appendChild(yenile);
        canliPanelRozetDurumunuGuncelle();
      });
  }

  function topluKosuDurdur() {
    TOPLU_KOSU.iptal = true;
    TOPLU_KOSU.calisanlar.forEach(function (kosuId) { senaryoDurdurIstegiGonder(kosuId); });
  }

  function senaryoSonucPopupGoster(senaryoAdi, veri) {
    var icerikAlani = document.getElementById('senaryoSonucModalIcerik');
    var calistirilamadiMi = !veri || !veri.basarili;
    var govde = '<p class="modal-baslik">' + escapeHtml(senaryoAdi) + '</p>';
    govde += '<p class="senaryo-sonuc-ozet">Ortam: ' + escapeHtml(String(ORTAM).toUpperCase()) + '</p>';

    if (calistirilamadiMi) {
      govde += '<div class="senaryo-sonuc-satir"><span class="rozet rozet-kritik">Çalıştırılamadı</span></div>';
      govde += '<pre class="hata-mesaj">' + escapeHtml((veri && veri.mesaj) || 'Bilinmeyen hata.') + '</pre>';
    } else {
      var basariliMi = veri.durum === 'passed';
      var notrMu = veri.durum === 'skipped' || veri.durum === 'iptal';
      var rozetSinif = basariliMi ? 'rozet-iyi' : notrMu ? 'rozet-notr' : 'rozet-kritik';
      var sure = senaryoSureMetni(veri.sureMs);
      govde += '<div class="senaryo-sonuc-satir"><span class="rozet ' + rozetSinif + '">' + escapeHtml(senaryoDurumEtiketi(veri.durum)) + '</span>' +
        (sure ? '<span class="senaryo-sonuc-ozet">' + escapeHtml(sure) + '</span>' : '') + '</div>';
      if (veri.durum === 'iptal') {
        govde += '<div class="bos-durum">Bu koşu, "Durdur" ikonuyla kullanıcı tarafından iptal edildi.</div>';
      } else if (veri.hataMesaji) {
        govde += '<div class="hata-ornek-etiket">Hata</div><pre class="hata-mesaj">' + escapeHtml(veri.hataMesaji) + '</pre>';
      } else if (!basariliMi) {
        govde += '<div class="bos-durum">Detaylı hata mesajı yok — test-sunucu terminalindeki çıktıya bakın.</div>';
      }

      // Başarılı koşularda da fixtures.ts'in çektiği son ekran görüntüsü — "hata-goruntu"
      // sınıfı sayesinde tıklanınca mevcut lightbox (gorselBuyutmeAc) ile büyütülebilir.
      if (ekranGoruntusuKaynagi(veri)) {
        var goruntuEtiketi = basariliMi ? 'Son ekran görüntüsü' : 'Hata anındaki ekran görüntüsü';
        govde += '<div class="hata-ornek-etiket">' + escapeHtml(goruntuEtiketi) + '</div>' +
          '<img class="hata-goruntu" src="' + escapeHtml(ekranGoruntusuKaynagi(veri)) + '" alt="' + escapeHtml(senaryoAdi) + ' — ' + escapeHtml(goruntuEtiketi) + '" />';
      }

      // Koşu videosu — playwright.config.ts'in "video: 'on'" (dashboard koşularına
      // özel) ayarı sayesinde başarılı/başarısız her koşuda mevcuttur. Sayfaya gömülmez;
      // yeni sekmede açılan bir bağlantı olarak verilir.
      govde += videoBaglantisiHtml(veri.videoUrl);
    }

    icerikAlani.innerHTML = govde;
    document.getElementById('senaryoSonucModalOrtu').classList.add('acik');
  }

  function senaryoSonucModalKapat() {
    document.getElementById('senaryoSonucModalOrtu').classList.remove('acik');
  }

  // ------------------------------------------------------------------------------
  // "+ Senaryo Oluştur" (JetSeyahat) — kullanıcı popup'ta ürüne özel alanları
  // doldurur, "Senaryoyu Koş" ile GEÇİCİ bir başlıkla deneme koşusu yaptırır
  // (jet-seyahat.json'a geçici eklenip sonuç alındıktan sonra sunucu tarafında geri
  // çıkarılır — bkz. test-sunucu.mjs /jetseyahat-senaryo/dene), sonucu görür, isterse
  // "Kaydet" ile kalıcı bir başlıkla jet-seyahat.json'a KALICI olarak ekletir
  // (/jetseyahat-senaryo/kaydet). Kayıttan sonra "Senaryolar" listesinde görünmesi
  // için dashboard'un yeniden üretilmesi (npm run rapor:test) gerekir — mevcut
  // "Koşu geçmişi" statik anlık görüntü sınırlamasıyla aynı mimari kısıt.
  // ------------------------------------------------------------------------------
  var SENARYO_OLUSTUR_SON_SONUC = null; // Son "Senaryoyu Koş" denemesinin sonucu (kaydet adımında kullanılır).
  // "✎ Düzenle" ile açıldıysa düzenleme durumu, "+ Senaryo Oluştur" ile açıldıysa null:
  // { anahtar, eskiBaslik, getir (/senaryo-getir yanıtı), acente: { profil, kod, kullanici },
  //   onaylananBaslik (başlık değişikliği uyarısının onaylandığı başlık) }.
  var SENARYO_DUZENLE = null;
  // /jetseyahat-yardimci-veri'den gelen hazır profil listeleri (ettiren/sigortalı
  // dropdown'larını "tc1 (45520772518, 13.04.1998)" gibi etiketlerle doldurmak için) ve
  // "Çoklu" sorgu tipinde kullanılacak sabit Excel bilgisi. Modal her açıldığında tazelenir;
  // fetch tamamlanana kadar boş listelerle başlar.
  var SENARYO_OLUSTUR_KIMLIK_PROFILLERI = { ozel: {}, tuzel: {} };
  // Doğrulayıcının ortak veri bağlamı (hazır profiller, acente profili → acente kodu, ortak
  // kart). Yardımcı veri gelene kadar null: o zaman profil varlığı / acenteye bağlı
  // görünürlük kontrolleri atlanır (sunucu aynı kuralları ayrıca uygular).
  var SENARYO_OLUSTUR_ORTAK_BAGLAMI = null;
  var SENARYO_OLUSTUR_COKLU_SORGU_BILGISI = {};
  // Popup'ta "Çoklu" sorgu için özel bir Excel yüklendiyse (bkz. cokluSorguDosyasiSecildi),
  // sunucunun döndüğü { dosyaYolu, dosyaAdi } burada tutulur; senaryoOlusturFormundanVeriTopla
  // bunu senaryo.cokluSorguDosyasi olarak gönderir. Modal her açıldığında sıfırlanır.
  var SENARYO_OLUSTUR_COKLU_SORGU_YUKLEME = null;
  // "Beklenen Sonuç > Başarılı akış" açıklamasındaki, ödeme sonrası başarı sayılan
  // mesajlar: rapor üretilirken jet-seyahat.json'dan VERI'ye gömülür, popup açılınca
  // /jetseyahat-yardimci-veri'den gelen güncel liste varsa onunla değiştirilir.
  var SENARYO_OLUSTUR_KABUL_EDILEN_ODEME_SONUCLARI = VERI.jetSeyahatKabulEdilenOdemeSonuclari || [];
  // Ortak test kartı (ortak.json > odeme.krediKarti) — "Ödeme bilgileri" alanlarının ön
  // değeri ve "kart değiştirildi mi?" karşılaştırmasının referansı. Dashboard HTML'ine
  // GÖMÜLMEZ; popup açılınca /jetseyahat-yardimci-veri'den alınır (gelene kadar null).
  var SENARYO_OLUSTUR_VARSAYILAN_KART = null;
  // "Ödeme bilgileri" alanları bu popup açılışında dolduruldu mu? (Yeni senaryoda varsayılan
  // kart fetch'ten SONRA gelir; kullanıcı o arada yazmaya başladıysa üzerine yazılmaz.)
  var SENARYO_OLUSTUR_KART_DOLDURULDU = false;

  // Kapsam/alternatif eşleşmesi GALAKSİ ekranında sabit — her popup açılışında ekrandan
  // okumaya gerek yok (bu daha önce canlı bir tarayıcı açıp birkaç saniye sürüyordu).
  // Ekrana ileride yeni bir kapsam/alternatif eklenirse burası elle güncellenir.
  var JETSEYAHAT_KAPSAM_ALTERNATIF = {
    'DÜNYA': ['VİZE TÜM DÜNYA', 'SEYAHAT PAKET'],
    'AVRUPA': ['VİZE SCHENGEN', 'SEYAHAT PAKET']
  };

  // Kapsam dropdown'unu sabit listeyle doldurur; alternatif listesi kapsam seçimine
  // göre senaryoOlusturAlternatifleriGuncelle ile tazelenir.
  function senaryoOlusturSecenekleriYukle() {
    var kapsamSelect = document.getElementById('sof_kapsam');
    if (!kapsamSelect) return;
    kapsamSelect.innerHTML = Object.keys(JETSEYAHAT_KAPSAM_ALTERNATIF).map(function (k) {
      return '<option value="' + escapeHtml(k) + '">' + escapeHtml(k) + '</option>';
    }).join('');
    senaryoOlusturAlternatifleriGuncelle();
  }

  // Alternatif seçenekleri KAPSAM'a göre değiştiğinden (ör. AVRUPA'da SCHENGEN varken
  // DÜNYA'da yok), kapsam her değiştiğinde alternatif listesi bu fonksiyonla tazelenir.
  function senaryoOlusturAlternatifleriGuncelle() {
    var kapsamSelect = document.getElementById('sof_kapsam');
    var alternatifSelect = document.getElementById('sof_alternatif');
    if (!kapsamSelect || !alternatifSelect) return;
    var secenekler = JETSEYAHAT_KAPSAM_ALTERNATIF[kapsamSelect.value] || [];
    alternatifSelect.innerHTML = secenekler.map(function (a) {
      return '<option value="' + escapeHtml(a) + '">' + escapeHtml(a) + '</option>';
    }).join('');
  }

  // Hazır profil listelerini ve çoklu-sorgu Excel bilgisini sunucudan çeker; modal zaten
  // açıksa (ettiren/sigortalı bloğu "farklı" konumundaysa) o bloğu güncel etiketlerle
  // yeniden çizer.
  function senaryoOlusturYardimciVeriYukle() {
    return fetch(TEST_SUNUCU.taban + '/jetseyahat-yardimci-veri?ortam=' + encodeURIComponent(ORTAM) + '&token=' + encodeURIComponent(TEST_SUNUCU.token))
      .then(function (yanit) { return yanit.json(); })
      .then(function (sonuc) {
        if (!sonuc || !sonuc.basarili) return;
        SENARYO_OLUSTUR_KIMLIK_PROFILLERI = sonuc.kimlikProfilleri || { ozel: {}, tuzel: {} };
        SENARYO_OLUSTUR_COKLU_SORGU_BILGISI = sonuc.cokluSorgu || {};
        if (Array.isArray(sonuc.kabulEdilenOdemeSonuclari)) {
          SENARYO_OLUSTUR_KABUL_EDILEN_ODEME_SONUCLARI = sonuc.kabulEdilenOdemeSonuclari;
          beklenenSonucAlaniniGuncelle();
        }
        SENARYO_OLUSTUR_VARSAYILAN_KART = sonuc.varsayilanKrediKarti || null;
        SENARYO_OLUSTUR_ORTAK_BAGLAMI = {
          kimlikProfilleri: SENARYO_OLUSTUR_KIMLIK_PROFILLERI,
          acenteProfilleri: sonuc.acenteProfilleri || undefined,
          varsayilanKrediKarti: SENARYO_OLUSTUR_VARSAYILAN_KART
        };
        // Yeni senaryoda alanlar henüz boşsa (ve kullanıcı dokunmadıysa) ortak kartla doldurulur.
        if (!SENARYO_OLUSTUR_KART_DOLDURULDU && document.getElementById('sof_kartNo')) {
          odemeKartiniDoldur(SENARYO_OLUSTUR_VARSAYILAN_KART);
        }
        var ettirenSelect = document.getElementById('sof_ettiren');
        if (ettirenSelect && ettirenSelect.value !== 'ayni') ettirenAltBlokCiz();
        var sigortaliSelect = document.getElementById('sof_sigortaliTipi');
        if (sigortaliSelect && sigortaliSelect.value !== 'varsayilan') sigortaliAltBlokGuncelle();
        cokluSorguVarsayilanGuncelle();
      })
      .catch(function () {});
  }

  // "Çoklu" sorgu tipi seçildiğinde yükleme alanını gösterir/gizler; bir dosya zaten
  // yüklendiyse (SENARYO_OLUSTUR_COKLU_SORGU_YUKLEME) durum metnine dokunmaz, yoksa
  // ürünün sabit dosyasının kullanılacağını hatırlatır.
  function cokluSorguAlaniGuncelle() {
    var alanEl = document.getElementById('sof_cokluSorguAlan');
    var sorguTipiEl = document.getElementById('sof_sorguTipi');
    if (!alanEl || !sorguTipiEl) return;
    alanEl.classList.toggle('gizli', sorguTipiEl.value !== 'coklu');
    cokluSorguVarsayilanGuncelle();
  }

  // "Özel Excel yüklenmezse ürünün sabit dosyası kullanılır" hatırlatmasını günceller;
  // bir dosya zaten başarıyla yüklendiyse bu hatırlatma gösterilmez (cokluSorguDosyasiSecildi
  // o alana kendi "Yüklendi: ..." mesajını yazar).
  function cokluSorguVarsayilanGuncelle() {
    var varsayilanEl = document.getElementById('sof_cokluSorguVarsayilan');
    var sorguTipiEl = document.getElementById('sof_sorguTipi');
    if (!varsayilanEl || !sorguTipiEl) return;
    if (sorguTipiEl.value !== 'coklu' || SENARYO_OLUSTUR_COKLU_SORGU_YUKLEME) {
      varsayilanEl.innerHTML = '';
      return;
    }
    var bilgi = SENARYO_OLUSTUR_COKLU_SORGU_BILGISI || {};
    var kisiSayisiMetni = bilgi.kisiSayisi ? ' (' + escapeHtml(String(bilgi.kisiSayisi)) + ' kişi)' : '';
    varsayilanEl.innerHTML = '<p class="senaryo-form-yardim">Excel yüklenmezse ürünün sabit dosyası kullanılır: ' +
      escapeHtml(bilgi.dosya || '(yükleniyor...)') + kisiSayisiMetni + '</p>';
  }

  // Seçilen .xlsx dosyasını base64'e çevirip sunucuya yükler (bkz. test-sunucu.mjs >
  // /jetseyahat-coklu-sorgu-yukle); başarılı olursa dönen göreli yol
  // SENARYO_OLUSTUR_COKLU_SORGU_YUKLEME'de tutulur ve senaryoOlusturFormundanVeriTopla
  // bunu senaryo.cokluSorguDosyasi olarak gönderir. Kişi sayısı otomatik algılanamadığından
  // (Excel içeriği ayrıştırılmıyor) kullanıcı ayrı bir alana kendisi girer.
  function cokluSorguDosyasiSecildi(olay) {
    var dosya = olay.target.files && olay.target.files[0];
    var durumEl = document.getElementById('sof_cokluSorguDurum');
    SENARYO_OLUSTUR_COKLU_SORGU_YUKLEME = null;
    cokluSorguVarsayilanGuncelle();
    if (!dosya) { durumEl.innerHTML = ''; return; }
    // NOT: Bu kod bir template literal içinde üretiliyor — kaynaktaki çift ters eğik çizgi
    // HTML'e tek olarak çıkar. Tek yazılırsa template literal onu yutar ve desen "nokta"
    // yerine "herhangi bir karakter + xlsx" anlamına gelir (ör. "raporxlsx" kabul edilirdi).
    if (!/\.xlsx$/i.test(dosya.name)) {
      durumEl.innerHTML = '<p class="senaryo-form-hata">Yalnızca .xlsx dosyaları desteklenir.</p>';
      olay.target.value = '';
      return;
    }
    durumEl.innerHTML = '<p class="senaryo-form-yardim">Yükleniyor...</p>';
    var okuyucu = new FileReader();
    okuyucu.onload = function () {
      var base64 = String(okuyucu.result || '').split(',')[1] || '';
      fetch(TEST_SUNUCU.taban + '/jetseyahat-coklu-sorgu-yukle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ortam: ORTAM, token: TEST_SUNUCU.token, dosyaAdi: dosya.name, veriBase64: base64 })
      })
        .then(function (yanit) { return yanit.json(); })
        .catch(function () { return { basarili: false, mesaj: 'Test sunucusuna ulaşılamadı.' }; })
        .then(function (sonuc) {
          if (!sonuc || !sonuc.basarili) {
            durumEl.innerHTML = '<p class="senaryo-form-hata">Yüklenemedi: ' + escapeHtml((sonuc && sonuc.mesaj) || 'bilinmeyen hata') + '</p>';
            return;
          }
          SENARYO_OLUSTUR_COKLU_SORGU_YUKLEME = { dosyaYolu: sonuc.dosyaYolu, dosyaAdi: dosya.name };
          cokluSorguVarsayilanGuncelle();
          durumEl.innerHTML = '<p class="senaryo-form-yardim">Yüklendi: ' + escapeHtml(dosya.name) + ' — kişi sayısını girmeyi unutmayın.</p>';
        });
    };
    okuyucu.onerror = function () {
      durumEl.innerHTML = '<p class="senaryo-form-hata">Dosya okunamadı.</p>';
    };
    okuyucu.readAsDataURL(dosya);
  }

  // Ettiren ve sigortalı bloklarının ikisi de aynı desende: "hazır profil kullan" (bir
  // profil anahtarı seç, gerçek kimlik test anında ortak.json'dan çözülür) ya da "yeni
  // kimlik gir" (bu senaryoya özel serbest kimlik alanları). alanOnEki, üretilen
  // eleman id'lerinin ve radio-grup adının önekidir (ör. "sof_ettiren", "sof_sigortali").
  function kimlikAltBlokCiz(blokEl, tip, alanOnEki) {
    var profiller = (tip === 'tuzel'
      ? (SENARYO_OLUSTUR_KIMLIK_PROFILLERI || {}).tuzel
      : (SENARYO_OLUSTUR_KIMLIK_PROFILLERI || {}).ozel) || {};
    var hazirProfilSecenekleri = Object.keys(profiller).map(function (anahtar) {
      var p = profiller[anahtar] || {};
      var etiket = tip === 'tuzel'
        ? anahtar + ' (' + (p.vergiKimlikNo || '') + ')'
        : anahtar + ' (' + (p.tcKimlikNo || '') + ', ' + (p.dogumTarihi || '') + ')';
      return '<option value="' + escapeHtml(anahtar) + '">' + escapeHtml(etiket) + '</option>';
    }).join('');
    var serbestAlanlariHtml = tip === 'tuzel'
      // Vergi Dairesi ekranda hiç kullanılmıyor (bkz. jet-seyahat.page.ts >
      // farkliTuzelEttirenGir — yalnızca vergiKimlikNo + cepTelefonu ile sorgulanıyor),
      // bu yüzden popup'ta da istenmiyor.
      ? '<div class="senaryo-form-satir">' +
          '<div class="senaryo-form-alan"><label>Vergi Kimlik No</label><input type="text" id="' + alanOnEki + 'Vkn" /></div>' +
          '<div class="senaryo-form-alan"><label>Cep Telefonu</label><input type="text" id="' + alanOnEki + 'Telefon" /></div>' +
        '</div>'
      : '<div class="senaryo-form-satir">' +
          '<div class="senaryo-form-alan"><label>T.C. Kimlik No</label><input type="text" id="' + alanOnEki + 'Tc" /></div>' +
          '<div class="senaryo-form-alan"><label>Doğum Tarihi <span class="senaryo-form-yardim">(gg.aa.yyyy)</span></label><input type="text" id="' + alanOnEki + 'Dogum" placeholder="13.04.1998" /></div>' +
          '<div class="senaryo-form-alan"><label>Cep Telefonu</label><input type="text" id="' + alanOnEki + 'Telefon" /></div>' +
        '</div>';
    var radioAdi = alanOnEki + 'Kaynak';
    blokEl.innerHTML =
      '<div class="senaryo-form-alt-blok">' +
        '<div class="senaryo-form-radio-grup">' +
          '<label><input type="radio" name="' + radioAdi + '" value="hazir" checked /> Hazır profil kullan</label>' +
          '<label><input type="radio" name="' + radioAdi + '" value="serbest" /> Yeni kimlik gir</label>' +
        '</div>' +
        '<div id="' + alanOnEki + 'HazirAlani" class="senaryo-form-alan"><label>Profil</label><select id="' + alanOnEki + 'Profili">' + hazirProfilSecenekleri + '</select></div>' +
        '<div id="' + alanOnEki + 'SerbestAlani" class="senaryo-form-alan gizli">' + serbestAlanlariHtml + '</div>' +
      '</div>';
    Array.prototype.forEach.call(blokEl.querySelectorAll('[name="' + radioAdi + '"]'), function (radio) {
      radio.addEventListener('change', function () {
        var hazirSecili = document.querySelector('[name="' + radioAdi + '"]:checked').value === 'hazir';
        document.getElementById(alanOnEki + 'HazirAlani').classList.toggle('gizli', !hazirSecili);
        document.getElementById(alanOnEki + 'SerbestAlani').classList.toggle('gizli', hazirSecili);
      });
    });
  }

  // ---- "Ödeme bilgileri" (senaryoya özel kart) ----
  // Taksit seçenekleri ve metinleri tek doğrulayıcıdan (SenaryoDogrulayici.TAKSIT_UST_SINIRI /
  // taksitMetni — ortak karttaki "Tek Çekim" kalıbı); kart kuralları da orada.

  function odemeBilgileriBlokHtml() {
    var ayHtml = '';
    for (var ay = 1; ay <= 12; ay++) {
      ayHtml += '<option value="' + ay + '">' + (ay < 10 ? '0' + ay : String(ay)) + '</option>';
    }
    var buYil = new Date().getFullYear();
    var yilHtml = '';
    for (var yil = buYil; yil <= buYil + 15; yil++) {
      yilHtml += '<option value="' + yil + '">' + yil + '</option>';
    }
    var taksitHtml = '';
    for (var t = 1; t <= SenaryoDogrulayici.TAKSIT_UST_SINIRI; t++) {
      taksitHtml += '<option value="' + t + '">' + escapeHtml(SenaryoDogrulayici.taksitMetni(t)) + '</option>';
    }
    // Kart no / CVV: tarayıcı kaydetmesin/otomatik doldurmasın diye autocomplete kapalı,
    // ekranda maskeli (type=password); "göster" ile geçici olarak açılır.
    var maskeliAlan = function (id, etiket, ekOzellikler) {
      return '<div class="senaryo-form-alan"><label for="' + id + '">' + etiket + '</label>' +
        '<div class="odeme-maskeli-satir">' +
          '<input type="password" id="' + id + '" autocomplete="off" inputmode="numeric" spellcheck="false" data-lpignore="true" ' + ekOzellikler + ' />' +
          '<button type="button" class="odeme-goster-buton" data-hedef="' + id + '" aria-pressed="false" aria-label="' + etiket + ' göster">göster</button>' +
        '</div></div>';
    };
    return '<div id="sof_odemeBilgileri" class="senaryo-form-alt-blok gizli" role="group" aria-labelledby="sof_odemeBilgileriBaslik">' +
      '<p class="odeme-bilgileri-baslik" id="sof_odemeBilgileriBaslik">Ödeme bilgileri</p>' +
      (String(ORTAM) === 'canli'
        ? '<p class="odeme-canli-uyari" role="alert" id="sof_odemeCanliUyari">CANLI ortam: buraya yalnızca test kartı girin; kart bilgisi senaryo dosyasına (git) yazılır.</p>'
        : '') +
      '<p class="senaryo-form-yardim beklenen-sonuc-yardim" id="sof_odemeVarsayilanNotu">Değiştirmezseniz ortak test kartı kullanılır.</p>' +
      '<div class="senaryo-form-satir">' +
        '<div class="senaryo-form-alan"><label for="sof_kartIsim">Kart üzerindeki ad</label><input type="text" id="sof_kartIsim" autocomplete="off" /></div>' +
        '<div class="senaryo-form-alan"><label for="sof_kartSoyisim">Kart üzerindeki soyad</label><input type="text" id="sof_kartSoyisim" autocomplete="off" /></div>' +
      '</div>' +
      '<div class="senaryo-form-satir">' +
        maskeliAlan('sof_kartNo', 'Kart numarası', 'maxlength="19" placeholder="16 hane"') +
        maskeliAlan('sof_kartCvv', 'CVV', 'maxlength="4" placeholder="3-4 hane"') +
      '</div>' +
      '<div class="senaryo-form-satir">' +
        '<div class="senaryo-form-alan"><label for="sof_kartAy">Son kullanma ayı</label><select id="sof_kartAy">' + ayHtml + '</select></div>' +
        '<div class="senaryo-form-alan"><label for="sof_kartYil">Son kullanma yılı</label><select id="sof_kartYil">' + yilHtml + '</select></div>' +
        '<div class="senaryo-form-alan"><label for="sof_kartTaksit">Taksit</label><select id="sof_kartTaksit">' + taksitHtml + '</select></div>' +
      '</div>' +
    '</div>';
  }

  // Blok çizildikten sonra bir kez bağlanır: "göster/gizle" düğmeleri ve kullanıcı bir alana
  // dokununca, geç gelen varsayılan kartın yazdıklarını ezmemesi için işaret.
  function odemeBilgileriOlaylariniBagla() {
    var blok = document.getElementById('sof_odemeBilgileri');
    if (!blok) return;
    Array.prototype.forEach.call(blok.querySelectorAll('.odeme-goster-buton'), function (buton) {
      buton.addEventListener('click', function () {
        var hedef = document.getElementById(buton.getAttribute('data-hedef'));
        if (!hedef) return;
        var gosteriliyor = hedef.type === 'text';
        hedef.type = gosteriliyor ? 'password' : 'text';
        buton.textContent = gosteriliyor ? 'göster' : 'gizle';
        buton.setAttribute('aria-pressed', gosteriliyor ? 'false' : 'true');
      });
    });
    blok.addEventListener('input', function () { SENARYO_OLUSTUR_KART_DOLDURULDU = true; });
    blok.addEventListener('change', function () { SENARYO_OLUSTUR_KART_DOLDURULDU = true; });
  }

  // Alanları bir kart nesnesiyle (senaryonun kendi kartı ya da ortak kart) doldurur; kart
  // yoksa (sunucuya ulaşılamadı) alanlar boş kalır.
  function odemeKartiniDoldur(kart) {
    var el = function (id) { return document.getElementById(id); };
    if (!el('sof_kartNo')) return;
    var k = kart || {};
    el('sof_kartIsim').value = k.isim || '';
    el('sof_kartSoyisim').value = k.soyisim || '';
    el('sof_kartNo').value = k.kartNo || '';
    el('sof_kartCvv').value = k.guvenlikKodu || '';
    secimDegeriniAyarla(el('sof_kartAy'), k.sonKullanmaAyi && k.sonKullanmaAyi.deger, '');
    secimDegeriniAyarla(el('sof_kartYil'), k.sonKullanmaYili && k.sonKullanmaYili.deger, '');
    secimDegeriniAyarla(el('sof_kartTaksit'), k.taksit && k.taksit.deger, '');
  }

  // Formdaki kartı ortak.json > odeme.krediKarti biçiminde döner (kart no boşluksuz).
  function odemeKartiniFormdanOku() {
    var el = function (id) { return document.getElementById(id); };
    var secim = function (id) {
      var s = el(id);
      var secenek = s && s.selectedOptions && s.selectedOptions[0];
      return { deger: s ? s.value : '', metin: secenek ? secenek.textContent : '' };
    };
    var ay = secim('sof_kartAy');
    var ayNo = parseInt(ay.deger, 10);
    return {
      isim: el('sof_kartIsim').value.trim(),
      soyisim: el('sof_kartSoyisim').value.trim(),
      kartNo: el('sof_kartNo').value.replace(/\s+/g, ''),
      guvenlikKodu: el('sof_kartCvv').value.trim(),
      sonKullanmaAyi: { deger: ay.deger, metin: ayNo > 0 && ayNo < 10 ? '0' + ayNo : ay.deger },
      sonKullanmaYili: { deger: secim('sof_kartYil').deger, metin: secim('sof_kartYil').deger },
      taksit: secim('sof_kartTaksit')
    };
  }

  // Senaryoya yazılacak kart: ödeme dahil değilse ya da kart ortak kartla AYNIYSA undefined
  // (senaryo ortak kartı kullanır). Ortak kart alınamadıysa ve alanlar tamamen boşsa da
  // gönderilmez; bir şey yazılmışsa gönderilir (sunucu ayrıca ortak kartla karşılaştırır).
  function odemeKartiniTopla() {
    var odemeKutusu = document.getElementById('sof_odemeAdimiDahil');
    if (!odemeKutusu || !odemeKutusu.checked || !document.getElementById('sof_kartNo')) return undefined;
    var kart = odemeKartiniFormdanOku();
    if (SENARYO_OLUSTUR_VARSAYILAN_KART) {
      return SenaryoDogrulayici.krediKartlariAyniMi(kart, SENARYO_OLUSTUR_VARSAYILAN_KART) ? undefined : kart;
    }
    var bosMu = !kart.isim && !kart.soyisim && !kart.kartNo && !kart.guvenlikKodu;
    return bosMu ? undefined : kart;
  }

  // duzenleme: null → "+ Senaryo Oluştur" (yeni senaryo). Dolu → "✎ Düzenle" (bkz.
  // jetSeyahatDuzenleAc): { anahtar, getir } — aynı form düzenleme modunda açılır, üstte
  // özet + Başlık + Koşuya dahil alanları çıkar, form getir.formVerisi ile doldurulur.
  function senaryoOlusturModalAc(duzenleme) {
    var icerikAlani = document.getElementById('senaryoOlusturModalIcerik');
    var duzenlemeMi = !!(duzenleme && duzenleme.getir);
    SENARYO_OLUSTUR_SON_SONUC = null;
    SENARYO_DUZENLE = null;
    var duzenlemeUstHtml = '';
    if (duzenlemeMi) {
      var f = duzenleme.getir.formVerisi || {};
      SENARYO_DUZENLE = {
        anahtar: duzenleme.anahtar,
        eskiBaslik: duzenleme.getir.senaryo.baslik,
        getir: duzenleme.getir,
        acente: { profil: f.acenteProfili || '', kod: f.acenteKodu || '', kullanici: f.acenteKullanicisi || '', varsayilanMi: !!f.acenteVarsayilanMi },
        onaylananBaslik: null
      };
      duzenlemeUstHtml =
        '<dl class="senaryo-duzenle-ozet" aria-label="Senaryonun kayıtlı hâli">' +
          '<dt>Ürün</dt><dd>JetSeyahat</dd>' +
          '<dt>Başlık</dt><dd>' + escapeHtml(SENARYO_DUZENLE.eskiBaslik) + '</dd>' +
          '<dt>Beklenen sonuç</dt><dd>' + escapeHtml(beklenenSonucEtiketiClient(f)) + '</dd>' +
          '<dt>Ödeme dahil</dt><dd>' + (f.odemeAdimiDahil ? 'Evet' : 'Hayır') + '</dd>' +
          // Kart numarasının yalnızca son 4 hanesi gösterilir.
          (f.odemeAdimiDahil
            ? '<dt>Ödeme kartı</dt><dd>' + (f.krediKarti
                ? 'Senaryoya özel (**** ' + escapeHtml(String(f.krediKarti.kartNo || '').slice(-4)) + ')'
                : 'Ortak test kartı') + '</dd>'
            : '') +
          '<dt>Koşuda</dt><dd>' + (duzenleme.getir.kosuyaDahil ? 'Evet' : 'Hayır') + '</dd>' +
          '<dt>Acente</dt><dd>' + escapeHtml(
            (f.acenteAciklamasi || f.acenteKodu || '—') +
            (f.acenteKullanicisi ? ' · kullanıcı ' + f.acenteKullanicisi : '') +
            (f.acenteVarsayilanMi ? ' (varsayılan acente)' : '')
          ) + '</dd>' +
        '</dl>' +
        '<div class="senaryo-form-alan"><label for="sof_duzenleBaslik">Başlık</label>' +
          '<input type="text" id="sof_duzenleBaslik" required aria-required="true" />' +
        '</div>' +
        '<div class="senaryo-form-alan"><label class="senaryo-form-checkbox"><input type="checkbox" id="sof_duzenleKosuyaDahil" /> Koşuya dahil</label></div>';
    }
    icerikAlani.innerHTML =
      '<p class="modal-alt eski-duzenleyici-notu" role="note"><strong>Eski düzenleyici</strong> — yalnızca proje DOSYALARINA yazar ve kaldırılacak. Senaryoları platformdaki <strong>Senaryolar</strong> sekmesinden oluşturup düzenleyin (veritabanı).</p>' +
      (duzenlemeMi
        ? '<p class="modal-baslik">JetSeyahat — Senaryoyu Düzenle</p>' +
          '<p class="modal-alt">Değiştirmek istediğiniz alanları düzenleyin. "Senaryoyu Koş" ile deneyebilir ya da doğrudan "Değişiklikleri Kaydet" diyebilirsiniz.</p>'
        : '<p class="modal-baslik">JetSeyahat — Senaryo Oluştur</p>' +
          '<p class="modal-alt">Ekranda normalde doldurduğunuz alanları girin, "Senaryoyu Koş" ile önce deneyin.</p>') +
      '<form id="senaryoOlusturForm">' +
        duzenlemeUstHtml +
        '<div class="senaryo-form-satir">' +
          '<div class="senaryo-form-alan"><label>Kapsam</label>' +
            '<select id="sof_kapsam"></select>' +
          '</div>' +
          '<div class="senaryo-form-alan"><label>Alternatif</label>' +
            '<select id="sof_alternatif"></select>' +
          '</div>' +
        '</div>' +
        '<div class="senaryo-form-satir">' +
          '<div class="senaryo-form-alan"><label>COVID Teminatı</label>' +
            '<select id="sof_covid"><option value="E">Evet</option><option value="H">Hayır</option></select>' +
          '</div>' +
          '<div class="senaryo-form-alan"><label>Sorgu Tipi</label>' +
            '<select id="sof_sorguTipi"><option value="tekli">Tekli</option><option value="coklu">Çoklu</option></select>' +
          '</div>' +
        '</div>' +
        '<div class="senaryo-form-alan gizli" id="sof_cokluSorguAlan">' +
          '<label>Özel Excel Yükle <span class="senaryo-form-yardim">(yalnızca "Çoklu" sorguda; boş bırakılırsa ürünün sabit dosyası kullanılır)</span></label>' +
          '<div class="senaryo-form-satir" style="align-items:flex-end">' +
            '<div class="senaryo-form-alan" style="flex:2 1 200px"><input type="file" id="sof_cokluSorguDosyasi" accept=".xlsx" /></div>' +
            '<div class="senaryo-form-alan" style="flex:0 0 120px"><label>Kişi Sayısı</label><input type="number" min="1" id="sof_cokluSorguKisiSayisi" placeholder="ör. 10" /></div>' +
          '</div>' +
          '<div id="sof_cokluSorguVarsayilan"></div>' +
          '<div id="sof_cokluSorguDurum"></div>' +
        '</div>' +
        '<div class="senaryo-form-satir">' +
          '<div class="senaryo-form-alan"><label>Acente Kodu <span class="senaryo-form-yardim">(boş=varsayılan acente)</span></label><input type="text" id="sof_acenteKodu" placeholder="örn. 30447" /></div>' +
          '<div class="senaryo-form-alan"><label>Acente Kullanıcı Kodu</label><input type="text" id="sof_acenteKullanicisi" placeholder="örn. 604" /></div>' +
        '</div>' +
        '<div class="senaryo-form-alan"><label class="senaryo-form-checkbox"><input type="checkbox" id="sof_kayak" /> Kayak teminatı</label></div>' +
        '<div class="senaryo-form-alan"><label>Sigorta Ettiren</label>' +
          '<select id="sof_ettiren"><option value="ayni">Sigortalı ile aynı</option><option value="farkliOzel">Farklı özel (T.C.)</option><option value="farkliTuzel">Farklı tüzel (VKN)</option></select>' +
        '</div>' +
        '<div id="sof_ettirenAltBlok"></div>' +
        '<div class="senaryo-form-alan"><label>Sigortalı</label>' +
          '<select id="sof_sigortaliTipi"><option value="varsayilan">Ürün varsayılanı</option><option value="farkli">Farklı özel (T.C.)</option></select>' +
        '</div>' +
        '<div id="sof_sigortaliAltBlok"></div>' +
        // Beklenen sonuç (bkz. tests/support/beklenen-sonuc.ts): ödeme adımı dahil mi +
        // "Başarılı akış" ya da belirli bir adımda "İş kuralı hatası". Açıklama metinleri ve
        // adım seçeneklerinin açık/kapalı durumu beklenenSonucAlaniniGuncelle ile canlı tutulur.
        '<div class="senaryo-form-alan"><label class="senaryo-form-checkbox"><input type="checkbox" id="sof_odemeAdimiDahil" /> Ödeme adımını dahil et</label>' +
          '<p class="senaryo-form-yardim beklenen-sonuc-yardim">İşaretli değilse prim hesaplanıp teklif oluşunca test biter (poliçeleştirme ve ödemeye geçilmez). İşaretliyse kart bilgileri girilip ödeme de tamamlanır.</p>' +
        '</div>' +
        // "Ödeme bilgileri": yalnızca "Ödeme adımını dahil et" işaretliyken görünür (bkz.
        // beklenenSonucAlaniniGuncelle). Alanlar ortak test kartıyla (ortak.json >
        // odeme.krediKarti, /jetseyahat-yardimci-veri'den CANLI alınır — HTML'e gömülmez)
        // doldurulur; kullanıcı değiştirmezse senaryoya kart yazılmaz (bkz. odemeKartiniTopla).
        odemeBilgileriBlokHtml() +
        '<div class="senaryo-form-alan"><label>Beklenen Sonuç</label>' +
          '<div class="senaryo-form-radio-grup" role="radiogroup" aria-label="Beklenen Sonuç">' +
            '<label><input type="radio" name="sof_beklenenSonucTipi" value="basarili" checked /> Başarılı akış</label>' +
            '<label><input type="radio" name="sof_beklenenSonucTipi" value="isKuraliHatasi" /> İş kuralı hatası beklenir</label>' +
          '</div>' +
          '<div id="sof_basariliAlani" class="senaryo-form-alt-blok">' +
            '<p class="senaryo-form-yardim beklenen-sonuc-yardim" id="sof_basariKriteri" aria-live="polite"></p>' +
          '</div>' +
          '<div id="sof_isKuraliAlani" class="senaryo-form-alt-blok gizli">' +
            '<div class="senaryo-form-satir" style="align-items:flex-end">' +
              '<div class="senaryo-form-alan" style="flex:0 0 220px"><label for="sof_beklenenHataAdimi">Hatanın Beklendiği Adım</label>' +
                '<select id="sof_beklenenHataAdimi">' +
                  '<option value="primHesaplama">Prim hesaplama</option>' +
                  '<option value="policelestirme">Poliçeleştirme</option>' +
                  '<option value="odeme">Ödeme</option>' +
                '</select>' +
              '</div>' +
              '<div class="senaryo-form-alan" style="flex:2 1 200px"><label for="sof_beklenenHata">Beklenen Mesaj <span class="senaryo-form-yardim">(görülen uyarının bu metni içermesi yeterli; büyük/küçük harf, tırnak ve boşluk farkları önemsenmez)</span></label>' +
                '<textarea id="sof_beklenenHata" placeholder="örn. Covid Teminatı &quot;Hayır&quot; olması durumunda..."></textarea>' +
              '</div>' +
            '</div>' +
            '<p class="senaryo-form-yardim beklenen-sonuc-yardim" id="sof_adimIpucu"></p>' +
            '<p class="senaryo-form-yardim beklenen-sonuc-yardim">Başarılı sayılır: seçilen adımda bu mesajı içeren uyarı görünürse (test orada biter). Başarısız sayılır: uyarı çıkmaz ve akış devam ederse ya da farklı bir mesaj görünürse.</p>' +
          '</div>' +
        '</div>' +
        '<div id="sof_hataAlani"></div>' +
        '<div id="sof_sonucAlani"></div>' +
        '<div class="senaryo-form-buton-satir">' +
          '<button type="button" id="sof_kosButonu" class="birincil">Senaryoyu Koş</button>' +
          (duzenlemeMi ? '<button type="button" id="sof_degisiklikleriKaydetButonu" class="birincil">Değişiklikleri Kaydet</button>' : '') +
          '<button type="button" id="sof_vazgecButonu">Vazgeç</button>' +
        '</div>' +
        (duzenlemeMi
          ? '<p class="senaryo-form-yardim beklenen-sonuc-yardim" id="sof_denemeNotu" aria-live="polite"></p>' +
            '<div id="sof_duzenleKaydetAlani" aria-live="polite"></div>'
          : '') +
      '</form>';

    ettirenAltBlokCiz();
    document.getElementById('sof_ettiren').addEventListener('change', ettirenAltBlokCiz);

    sigortaliAltBlokGuncelle();
    document.getElementById('sof_sigortaliTipi').addEventListener('change', sigortaliAltBlokGuncelle);

    SENARYO_OLUSTUR_COKLU_SORGU_YUKLEME = null;
    document.getElementById('sof_sorguTipi').addEventListener('change', cokluSorguAlaniGuncelle);
    document.getElementById('sof_cokluSorguDosyasi').addEventListener('change', cokluSorguDosyasiSecildi);
    cokluSorguAlaniGuncelle();

    document.getElementById('sof_vazgecButonu').addEventListener('click', senaryoOlusturModalKapat);
    document.getElementById('sof_kosButonu').addEventListener('click', senaryoOlusturDene);

    document.getElementById('sof_odemeAdimiDahil').addEventListener('change', beklenenSonucAlaniniGuncelle);
    // "Ödeme bilgileri": yeni senaryoda ortak kart daha önce alındıysa hemen doldurulur;
    // yardımcı veri gelince (kullanıcı dokunmadıysa) güncel hâliyle tekrar doldurulur.
    SENARYO_OLUSTUR_KART_DOLDURULDU = false;
    odemeBilgileriOlaylariniBagla();
    if (!duzenlemeMi) odemeKartiniDoldur(SENARYO_OLUSTUR_VARSAYILAN_KART);
    Array.prototype.forEach.call(document.querySelectorAll('[name="sof_beklenenSonucTipi"]'), function (radio) {
      radio.addEventListener('change', beklenenSonucAlaniniGuncelle);
    });
    beklenenSonucAlaniniGuncelle();

    document.getElementById('sof_kapsam').addEventListener('change', senaryoOlusturAlternatifleriGuncelle);
    senaryoOlusturSecenekleriYukle();

    if (duzenlemeMi) {
      // Yardımcı veri (hazır profiller) jetSeyahatDuzenleAc'ta ZATEN yüklendi — burada
      // tekrar yüklenirse kimlik blokları yeniden çizilip doldurulan değerler silinirdi.
      senaryoFormunuDoldur(duzenleme.getir.formVerisi || {});
      document.getElementById('sof_duzenleBaslik').value = SENARYO_DUZENLE.eskiBaslik;
      document.getElementById('sof_duzenleKosuyaDahil').checked = !!duzenleme.getir.kosuyaDahil;
      document.getElementById('sof_degisiklikleriKaydetButonu').addEventListener('click', senaryoDuzenleKaydet);
      var form = document.getElementById('senaryoOlusturForm');
      form.addEventListener('input', senaryoDuzenleDenemeNotunuGuncelle);
      form.addEventListener('change', senaryoDuzenleDenemeNotunuGuncelle);
      senaryoDuzenleDenemeNotunuGuncelle();
    } else {
      senaryoOlusturYardimciVeriYukle();
    }

    document.getElementById('senaryoOlusturModalOrtu').classList.add('acik');
  }

  // Sigorta Ettiren bloğuyla AYNI desen (bkz. kimlikAltBlokCiz): "ayni" seçiliyken blok
  // boş; "farkliOzel"/"farkliTuzel" seçiliyken ilgili tip için hazır profil/serbest giriş
  // alanları çizilir.
  function ettirenAltBlokCiz() {
    var deger = document.getElementById('sof_ettiren').value;
    var blokEl = document.getElementById('sof_ettirenAltBlok');
    if (deger === 'ayni') { blokEl.innerHTML = ''; return; }
    kimlikAltBlokCiz(blokEl, deger === 'farkliOzel' ? 'ozel' : 'tuzel', 'sof_ettiren');
  }

  // Sigortalı her zaman bir gerçek kişi olduğundan (VKN yok), "farkli" seçiliyken sadece
  // özel (T.C.) tipiyle kimlikAltBlokCiz çağrılır.
  function sigortaliAltBlokGuncelle() {
    var deger = document.getElementById('sof_sigortaliTipi').value;
    var blokEl = document.getElementById('sof_sigortaliAltBlok');
    if (deger === 'varsayilan') { blokEl.innerHTML = ''; return; }
    kimlikAltBlokCiz(blokEl, 'ozel', 'sof_sigortali');
  }

  function senaryoOlusturModalKapat() {
    document.getElementById('senaryoOlusturModalOrtu').classList.remove('acik');
  }

  // Formdaki alanlardan sunucuya gönderilecek senaryo nesnesini üretir; ettiren/
  // sigortalı kimlik bilgileri "hazır profil" (profil adı) ya da "serbest giriş"
  // (doğrudan kimlik alanları) olabildiğinden ikisi de destekiği için ayrı ayrı okunur.
  function senaryoOlusturFormundanVeriTopla() {
    var el = function (id) { return document.getElementById(id); };
    var veri = {
      kapsam: el('sof_kapsam').value,
      alternatif: el('sof_alternatif').value,
      covidTeminati: el('sof_covid').value,
      sorguTipi: el('sof_sorguTipi').value,
      ettiren: el('sof_ettiren').value,
      kayakTeminati: el('sof_kayak').checked,
      // Yeni senaryolar her zaman AÇIKÇA yazar (bkz. tests/support/beklenen-sonuc.ts);
      // eski beklenenHataMesaji/beklenenHataAdimi alanları artık gönderilmez.
      odemeAdimiDahil: el('sof_odemeAdimiDahil').checked,
      beklenenSonuc: beklenenSonucTipiGetir() === 'isKuraliHatasi'
        ? { tip: 'isKuraliHatasi', adim: el('sof_beklenenHataAdimi').value, mesaj: el('sof_beklenenHata').value.trim() }
        : { tip: 'basarili' }
    };

    // Acente kodu ve kullanıcı kodu doğrudan elle yazılır — canlı bir sorgu/doğrulama
    // YAPILMAZ, kullanıcı doğru değerleri zaten bildiğini belirtti.
    var acenteKoduDeger = el('sof_acenteKodu').value.trim();
    var acenteKullanicisiDeger = el('sof_acenteKullanicisi').value.trim();
    var mevcutAcente = SENARYO_DUZENLE && SENARYO_DUZENLE.acente;
    if (mevcutAcente && (mevcutAcente.profil || mevcutAcente.varsayilanMi) &&
        acenteKoduDeger === mevcutAcente.kod && acenteKullanicisiDeger === mevcutAcente.kullanici) {
      // Düzenlemede acente alanlarına dokunulmadıysa kayıttaki profil ANAHTARI aynen
      // korunur (aynı kod+kullanıcıya sahip başka bir profile kaymasın diye). Senaryo
      // varsayılan acenteyle kayıtlıysa (formda o acente gösterilir) kayda acente yazılmaz.
      if (mevcutAcente.profil) veri.acenteProfili = mevcutAcente.profil;
    } else if (acenteKoduDeger) {
      veri.acenteKodu = acenteKoduDeger;
      veri.acenteKullanicisi = acenteKullanicisiDeger;
    }

    if (veri.ettiren !== 'ayni') {
      var kaynakEl = document.querySelector('[name="sof_ettirenKaynak"]:checked');
      var kaynak = kaynakEl ? kaynakEl.value : 'hazir';
      if (kaynak === 'hazir') {
        veri.ettirenProfili = el('sof_ettirenProfili').value;
      } else if (veri.ettiren === 'farkliOzel') {
        veri.ettirenOzelKimligi = {
          tcKimlikNo: (el('sof_ettirenTc') || {}).value || '',
          dogumTarihi: (el('sof_ettirenDogum') || {}).value || '',
          cepTelefonu: (el('sof_ettirenTelefon') || {}).value || ''
        };
      } else {
        veri.ettirenTuzelKimligi = {
          vergiKimlikNo: (el('sof_ettirenVkn') || {}).value || '',
          cepTelefonu: (el('sof_ettirenTelefon') || {}).value || ''
        };
      }
    }

    if (el('sof_sigortaliTipi').value === 'farkli') {
      var sigortaliKaynakEl = document.querySelector('[name="sof_sigortaliKaynak"]:checked');
      var sigortaliKaynak = sigortaliKaynakEl ? sigortaliKaynakEl.value : 'hazir';
      if (sigortaliKaynak === 'hazir') {
        veri.sigortaliProfili = el('sof_sigortaliProfili').value;
      } else {
        veri.sigortaliKimligi = {
          tcKimlikNo: (el('sof_sigortaliTc') || {}).value || '',
          dogumTarihi: (el('sof_sigortaliDogum') || {}).value || '',
          cepTelefonu: (el('sof_sigortaliTelefon') || {}).value || ''
        };
      }
    }

    // Senaryoya özel kart: yalnızca ödeme dahilken VE ortak karttan farklıysa gönderilir.
    var krediKarti = odemeKartiniTopla();
    if (krediKarti) veri.krediKarti = krediKarti;

    // Çoklu sorguda özel bir Excel yüklendiyse (bkz. cokluSorguDosyasiSecildi), o dosyanın
    // sunucudaki göreli yolu ve kullanıcının girdiği kişi sayısı gönderilir; yüklenmediyse
    // hiçbir alan set edilmez ve ürünün sabit dosyası kullanılmaya devam eder.
    if (veri.sorguTipi === 'coklu' && SENARYO_OLUSTUR_COKLU_SORGU_YUKLEME) {
      veri.cokluSorguDosyasi = SENARYO_OLUSTUR_COKLU_SORGU_YUKLEME.dosyaYolu;
      var kisiSayisiDeger = parseInt(el('sof_cokluSorguKisiSayisi').value, 10);
      if (kisiSayisiDeger > 0) veri.cokluSorguKisiSayisi = kisiSayisiDeger;
    }

    return veri;
  }

  function senaryoOlusturDene() {
    var hataAlani = document.getElementById('sof_hataAlani');
    var sonucAlani = document.getElementById('sof_sonucAlani');
    var kosButonu = document.getElementById('sof_kosButonu');
    hataAlani.innerHTML = '';
    sonucAlani.innerHTML = '';

    var veri = senaryoOlusturFormundanVeriTopla();
    if (!formBulgulariniGoster(senaryoFormuDogrula(veri), hataAlani)) return;

    kosButonu.disabled = true;
    kosButonu.textContent = 'Koşuluyor...';
    sonucAlani.innerHTML = '<div class="senaryo-form-hata" style="color:var(--text-muted)">Senaryo deneniyor, bu biraz sürebilir (login + tüm adımlar)...</div>';

    fetch(TEST_SUNUCU.taban + '/jetseyahat-senaryo/dene', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ortam: ORTAM, senaryo: veri, token: TEST_SUNUCU.token })
    })
      .then(function (yanit) { return yanit.json(); })
      .catch(function () {
        return { basarili: false, mesaj: 'Test sunucusuna ulaşılamadı. Bir terminalde "npm run test-sunucu" çalıştırıp tekrar deneyin.' };
      })
      .then(function (sonuc) {
        kosButonu.disabled = false;
        kosButonu.textContent = 'Senaryoyu Koş';
        // Sunucu doğrulaması reddettiyse (400 + hatalar) koşu hiç başlamadı: alanlarda gösterilir.
        if (sonuc && !sonuc.basarili && Array.isArray(sonuc.hatalar)) {
          sonucAlani.innerHTML = '';
          SENARYO_OLUSTUR_SON_SONUC = null;
          formBulgulariniGoster(sonuc, hataAlani);
          return;
        }
        SENARYO_OLUSTUR_SON_SONUC = { veri: veri, sonuc: sonuc };
        senaryoOlusturSonucGoster(sonuc);
      });
  }

  // "Senaryoyu Koş" ve "Değişiklikleri Kaydet"in ORTAK istemci tarafı kontrolü: TEK doğrulayıcı
  // (SenaryoDogrulayici — sunucu ve Playwright spec'i AYNI kodu ve mesajları kullanır), ekran
  // modeli (VERI.jetSeyahatEkranModeli) ve sunucudan gelen ortak veri bağlamıyla çalışır.
  // Dönüş: { gecerli, hatalar: [{ alan, mesaj }], uyarilar }.
  function senaryoDogrulamaBaglami() {
    var m = VERI.jetSeyahatEkranModeli || {};
    return {
      model: m.model,
      altModeller: m.altModeller,
      ortak: SENARYO_OLUSTUR_ORTAK_BAGLAMI || undefined,
      ortam: ORTAM,
      kaynak: 'girdi'
    };
  }

  function senaryoFormuDogrula(veri) {
    // Model gömülmemişse (eski/bozuk rapor) istemci kontrolü atlanır; sunucu yine doğrular.
    if (!VERI.jetSeyahatEkranModeli || !VERI.jetSeyahatEkranModeli.model) return { gecerli: true, hatalar: [], uyarilar: [] };
    return SenaryoDogrulayici.senaryoyuDogrula(veri, senaryoDogrulamaBaglami());
  }

  // Bulgunun (alan yolu, ör. "sigortaliKimligi.tcKimlikNo") formdaki kontrolü: modelin form
  // karşılıklarından türetilen adaylardan sayfada VAR olan ilki (radyo grubunda name).
  function formKontrolunuBul(alan) {
    if (!alan || !VERI.jetSeyahatEkranModeli) return null;
    var adaylar = SenaryoDogrulayici.alanFormKimlikleri(alan, senaryoDogrulamaBaglami());
    for (var i = 0; i < adaylar.length; i++) {
      var el = document.getElementById(adaylar[i]) || document.querySelector('[name="' + adaylar[i] + '"]');
      if (el) return el;
    }
    return null;
  }

  function formBulgulariniTemizle() {
    var form = document.getElementById('senaryoOlusturForm');
    if (!form) return;
    Array.prototype.forEach.call(form.querySelectorAll('.senaryo-form-alan-bulgu'), function (p) { p.remove(); });
    Array.prototype.forEach.call(form.querySelectorAll('[aria-invalid="true"]'), function (k) { k.removeAttribute('aria-invalid'); });
  }

  // Hataları/uyarıları ilgili alanın ALTINA yazar; alanı görünmeyen (ör. gizli alt blok) ya da
  // formda karşılığı olmayan bulgular özet alanında listelenir. Hata yoksa true döner.
  function formBulgulariniGoster(sonuc, ozetAlani) {
    formBulgulariniTemizle();
    var hatalar = (sonuc && sonuc.hatalar) || [];
    var uyarilar = (sonuc && sonuc.uyarilar) || [];
    var ozettekiler = [];
    var ilkHataliKontrol = null;
    var yerlestir = function (bulgu, tur) {
      var kontrol = formKontrolunuBul(bulgu.alan);
      var kap = kontrol && kontrol.closest('.senaryo-form-alan');
      if (!kap || kap.offsetParent === null) {
        ozettekiler.push({ bulgu: bulgu, tur: tur });
        return;
      }
      var p = document.createElement('p');
      p.className = 'senaryo-form-alan-bulgu ' + tur;
      p.setAttribute('data-alan', bulgu.alan);
      p.textContent = bulgu.mesaj;
      kap.appendChild(p);
      if (tur === 'hata') {
        kontrol.setAttribute('aria-invalid', 'true');
        if (!ilkHataliKontrol) ilkHataliKontrol = kontrol;
      }
    };
    hatalar.forEach(function (h) { yerlestir(h, 'hata'); });
    uyarilar.forEach(function (u) { yerlestir(u, 'uyari'); });
    if (ozetAlani) {
      ozetAlani.innerHTML =
        (hatalar.length
          ? '<p class="senaryo-form-hata" role="alert">Formda ' + hatalar.length + ' hata var; işaretli alanları düzeltin.</p>'
          : '') +
        ozettekiler.map(function (o) {
          return '<p class="' + (o.tur === 'hata' ? 'senaryo-form-hata' : 'senaryo-form-uyari') + '">' +
            escapeHtml((o.bulgu.alan ? o.bulgu.alan + ': ' : '') + o.bulgu.mesaj) + '</p>';
        }).join('');
    }
    if (ilkHataliKontrol && typeof ilkHataliKontrol.focus === 'function') ilkHataliKontrol.focus();
    return hatalar.length === 0;
  }

  function senaryoOlusturSonucGoster(sonuc) {
    var sonucAlani = document.getElementById('sof_sonucAlani');
    var basariliMi = sonuc && sonuc.basarili && sonuc.durum === 'passed';
    var durdurulduMu = !!(sonuc && sonuc.durum === 'iptal');
    var rozetSinif = basariliMi ? 'rozet-iyi' : durdurulduMu ? 'rozet-notr' : 'rozet-kritik';
    var rozetMetin = basariliMi ? 'Başarılı' : durdurulduMu ? 'Durduruldu' : 'Başarısız';
    var govde = '<div class="senaryo-sonuc-satir"><span class="rozet ' + rozetSinif + '">' + escapeHtml(rozetMetin) + '</span></div>';
    var gorulenOnerisi = null;
    if (!basariliMi) {
      var mesaj = (sonuc && (sonuc.hataMesaji || sonuc.mesaj)) || 'Detaylı hata mesajı yok — test-sunucu terminalindeki çıktıya bakın.';
      var beklenenGorulen = beklenenGorulenAyristir(mesaj);
      if (beklenenGorulen) {
        govde += '<dl class="beklenen-gorulen">' +
          '<dt>Beklenen</dt><dd>' + escapeHtml(beklenenGorulen.beklenen) + '</dd>' +
          '<dt>Görülen</dt><dd>' + escapeHtml(beklenenGorulen.gorulen) + '</dd>' +
        '</dl>';
      }
      govde += '<pre class="hata-mesaj">' + escapeHtml(mesaj) + '</pre>';
      gorulenOnerisi = durdurulduMu ? null : senaryoOlusturGorulenMesajiCikar(sonuc);
      if (gorulenOnerisi) {
        govde += '<div class="senaryo-form-buton-satir">' +
          '<button type="button" id="sof_beklenenHataOlarakKullan">Bu mesajı beklenen hata olarak kullan</button>' +
        '</div>' +
        '<div id="sof_beklenenHataOlarakKullanBilgi"></div>';
      }
    }
    if (ekranGoruntusuKaynagi(sonuc)) {
      govde += '<img class="hata-goruntu" src="' + escapeHtml(ekranGoruntusuKaynagi(sonuc)) + '" alt="Senaryo deneme sonucu" />';
    }
    if (SENARYO_DUZENLE) {
      // Düzenleme modunda ayrı bir "kaydedilsin mi?" sorusu yok — "Değişiklikleri Kaydet"
      // düğmesi formun o anki hâlini kaydeder (deneme şart değil).
      sonucAlani.innerHTML = govde;
      if (gorulenOnerisi) {
        document.getElementById('sof_beklenenHataOlarakKullan').addEventListener('click', function () {
          gorulenMesajiBeklenenHataYap(gorulenOnerisi);
        });
      }
      senaryoDuzenleDenemeNotunuGuncelle();
      return;
    }
    govde +=
      '<p style="margin:14px 0 6px;font-weight:700;font-size:12.5px;">Bu senaryo kalıcı olarak kaydedilsin mi?</p>' +
      '<div class="senaryo-form-buton-satir">' +
        '<button type="button" id="sof_kaydetButonu" class="birincil">Evet, kaydet</button>' +
        '<button type="button" id="sof_kaydetmeButonu">Hayır</button>' +
      '</div>' +
      '<div id="sof_kaydetAlani"></div>';
    sonucAlani.innerHTML = govde;

    document.getElementById('sof_kaydetmeButonu').addEventListener('click', function () {
      document.getElementById('sof_kaydetButonu').closest('.senaryo-form-buton-satir').remove();
    });
    document.getElementById('sof_kaydetButonu').addEventListener('click', senaryoOlusturBaslikSor);
    if (gorulenOnerisi) {
      document.getElementById('sof_beklenenHataOlarakKullan').addEventListener('click', function () {
        gorulenMesajiBeklenenHataYap(gorulenOnerisi);
      });
    }
  }

  function beklenenSonucTipiGetir() {
    var secili = document.querySelector('[name="sof_beklenenSonucTipi"]:checked');
    return secili ? secili.value : 'basarili';
  }

  // "Ödeme adımını dahil et" ve "Beklenen Sonuç" seçimine göre alt blokları gösterir/gizler,
  // başarı kriteri açıklamasını yazar ve ödeme dahil değilken Poliçeleştirme/Ödeme
  // adımlarını kapatır (seçiliyse Prim hesaplama'ya döner).
  function beklenenSonucAlaniniGuncelle() {
    var odemeKutusu = document.getElementById('sof_odemeAdimiDahil');
    if (!odemeKutusu) return;
    var odemeDahil = odemeKutusu.checked;
    var hataMi = beklenenSonucTipiGetir() === 'isKuraliHatasi';
    document.getElementById('sof_basariliAlani').classList.toggle('gizli', hataMi);
    // Kart alanları yalnızca ödeme adımı dahilken görünür (kapalıyken kart gönderilmez —
    // bkz. odemeKartiniTopla).
    var odemeBilgileri = document.getElementById('sof_odemeBilgileri');
    if (odemeBilgileri) odemeBilgileri.classList.toggle('gizli', !odemeDahil);
    document.getElementById('sof_isKuraliAlani').classList.toggle('gizli', !hataMi);

    var kabulListesi = (SENARYO_OLUSTUR_KABUL_EDILEN_ODEME_SONUCLARI || []).map(function (m) { return '“' + m + '”'; }).join(', ');
    document.getElementById('sof_basariKriteri').textContent = odemeDahil
      ? 'Başarılı sayılır: prim hesaplanır, poliçeleştirme ve kart adımları hatasız geçer ve ödeme sonrası şu mesajlardan biri görünürse: ' +
        (kabulListesi || '(liste yüklenemedi)') + '.'
      : 'Başarılı sayılır: prim hesaplanıp teklif tutarı 0’dan büyük görünürse. Ödeme adımına geçilmez, test burada biter.';

    var adimSelect = document.getElementById('sof_beklenenHataAdimi');
    Array.prototype.forEach.call(adimSelect.options, function (secenek) {
      if (secenek.value !== 'primHesaplama') secenek.disabled = !odemeDahil;
    });
    if (!odemeDahil && adimSelect.value !== 'primHesaplama') adimSelect.value = 'primHesaplama';
    document.getElementById('sof_adimIpucu').textContent = odemeDahil
      ? ''
      : 'Poliçeleştirme ve Ödeme adımları yalnızca "Ödeme adımını dahil et" işaretliyken seçilebilir.';
  }

  // tests/support/beklenen-sonuc.ts > beklenenGorulenMetni biçimini ayrıştırır:
  //   <adım> adımında beklenen sonuç doğrulanamadı.
  //   Beklenen: "<...>" — Görülen: "<...>"
  // Biçim eşleşmezse null döner.
  function beklenenGorulenAyristir(hataMesaji) {
    var eslesme = /Beklenen: (.*) — Görülen: "(.*)"/.exec(String(hataMesaji || ''));
    if (!eslesme) return null;
    var adimEslesme = /(Prim hesaplama|Poliçeleştirme|Ödeme) adımında beklenen sonuç doğrulanamadı/.exec(String(hataMesaji));
    return {
      beklenen: eslesme[1],
      gorulen: eslesme[2],
      adim: adimEslesme ? { 'Prim hesaplama': 'primHesaplama', 'Poliçeleştirme': 'policelestirme', 'Ödeme': 'odeme' }[adimEslesme[1]] : null
    };
  }

  // Başarısız bir "Senaryoyu Koş" sonucundan, beklenen hata olarak kullanılabilecek
  // GÖRÜLEN mesajı ve (çıkarılabiliyorsa) adımı bulur:
  //  - kredi-karti-odeme.page.ts > hataPopupVarsaDurdur: "... beklenmeyen bir hata pop-up'ı
  //    görüntülendi, senaryo burada durduruldu:" satırından sonraki pop-up metni,
  //  - beklenen sonuç doğrulanamadığında: "Görülen:" kısmı ("uyarı çıkmadı..." ve servis
  //    cevabı özetleri kullanılamaz, atlanır).
  // Adım önce sunucunun döndüğü başarısız test.step başlığından, yoksa hata metninden
  // çıkarılır; çıkarılamazsa null (formdaki seçim değiştirilmez).
  function senaryoOlusturGorulenMesajiCikar(sonuc) {
    var hataMesaji = String((sonuc && sonuc.hataMesaji) || '');
    if (!hataMesaji) return null;
    var mesaj = null;
    var adim = null;

    var popupEslesme = /beklenmeyen bir hata pop-up'ı görüntülendi, senaryo burada durduruldu:\s*([\s\S]*)$/.exec(hataMesaji);
    if (popupEslesme) {
      mesaj = popupEslesme[1].split(/\n\s*(?:Call log:|at )/)[0].replace(/\s*Tamam\s*$/, '').trim();
      var popupAdimi = /"([^"]*)" adımından sonra beklenmeyen/.exec(hataMesaji);
      if (popupAdimi && /Policelestir|Kredi kartı formu/i.test(popupAdimi[1])) adim = 'policelestirme';
    } else {
      var ayrisan = beklenenGorulenAyristir(hataMesaji);
      if (ayrisan && !/^(uyarı çıkmadı|servis cevabı:)/.test(ayrisan.gorulen)) {
        mesaj = ayrisan.gorulen.trim();
        adim = ayrisan.adim;
      }
    }
    if (!mesaj) return null;

    var adimBasligi = String((sonuc && sonuc.basarisizAdim) || '');
    if (/^Prim hesaplanır/.test(adimBasligi)) adim = 'primHesaplama';
    else if (/^Poliçeleştirme/.test(adimBasligi)) adim = 'policelestirme';
    else if (/^Ödeme/.test(adimBasligi)) adim = 'odeme';
    return { mesaj: mesaj, adim: adim };
  }

  // "Bu mesajı beklenen hata olarak kullan": formu "İş kuralı hatası beklenir"e çevirir,
  // mesajı doldurur, adımı (biliniyorsa) seçer. Poliçeleştirme/Ödeme adımı ödeme dahil
  // olmadan seçilemediğinden gerekirse "Ödeme adımını dahil et" de işaretlenir. Kaydetme
  // sorusu kaldırılır: kaydet, SON DENENEN veriyi gönderir — güncellenen form önce tekrar
  // koşulmalıdır.
  function gorulenMesajiBeklenenHataYap(oneri) {
    var hataRadyo = document.querySelector('[name="sof_beklenenSonucTipi"][value="isKuraliHatasi"]');
    hataRadyo.checked = true;
    if (oneri.adim && oneri.adim !== 'primHesaplama') document.getElementById('sof_odemeAdimiDahil').checked = true;
    beklenenSonucAlaniniGuncelle();
    if (oneri.adim) document.getElementById('sof_beklenenHataAdimi').value = oneri.adim;
    document.getElementById('sof_beklenenHata').value = oneri.mesaj;

    SENARYO_OLUSTUR_SON_SONUC = null;
    var kaydetButonu = document.getElementById('sof_kaydetButonu');
    if (kaydetButonu) {
      var kaydetSatiri = kaydetButonu.closest('.senaryo-form-buton-satir');
      if (kaydetSatiri && kaydetSatiri.previousElementSibling) kaydetSatiri.previousElementSibling.remove();
      if (kaydetSatiri) kaydetSatiri.remove();
    }
    var kaydetAlani = document.getElementById('sof_kaydetAlani');
    if (kaydetAlani) kaydetAlani.innerHTML = '';
    var kullanButonu = document.getElementById('sof_beklenenHataOlarakKullan');
    if (kullanButonu) kullanButonu.disabled = true;
    document.getElementById('sof_beklenenHataOlarakKullanBilgi').innerHTML =
      '<p class="senaryo-form-yardim beklenen-sonuc-yardim">Form güncellendi: “İş kuralı hatası beklenir”' +
      (oneri.adim ? ' — ' + escapeHtml(document.getElementById('sof_beklenenHataAdimi').selectedOptions[0].textContent) + ' adımı' : ' (adım çıkarılamadı, seçimi kontrol edin)') +
      (SENARYO_DUZENLE
        ? '. İsterseniz "Senaryoyu Koş" ile tekrar deneyin ya da "Değişiklikleri Kaydet" ile kaydedin.</p>'
        : '. Kaydetmeden önce "Senaryoyu Koş" ile tekrar deneyin.</p>');
    if (SENARYO_DUZENLE) senaryoDuzenleDenemeNotunuGuncelle();
    document.getElementById('sof_beklenenHata').focus();
  }

  function senaryoOlusturBaslikSor() {
    var kaydetAlani = document.getElementById('sof_kaydetAlani');
    kaydetAlani.innerHTML =
      '<div class="senaryo-form-alan"><label>Senaryo Başlığı</label><input type="text" id="sof_baslik" placeholder="örn. 30447 / DÜNYA / ... " /></div>' +
      '<div id="sof_kaydetHataAlani"></div>' +
      '<div class="senaryo-form-buton-satir"><button type="button" id="sof_kaydetOnayButonu" class="birincil">Kaydet</button></div>' +
      '<div id="sof_kosuyaDahilAlani"></div>';
    document.getElementById('sof_kaydetOnayButonu').addEventListener('click', senaryoOlusturKaydet);
  }

  // "Kaydet"e her basıldığında AÇIKÇA sorulur: yeni senaryo koşuya (Koşuyu başlat,
  // npm run test) dahil edilsin mi? Varsayılan yok — kullanıcı iki düğmeden birini seçmeden
  // istek gönderilmez; sunucu da cevapsız isteği reddeder (bkz. test-sunucu.mjs > /kaydet).
  function senaryoOlusturKaydet() {
    var baslikEl = document.getElementById('sof_baslik');
    var hataAlani = document.getElementById('sof_kaydetHataAlani');
    var soruAlani = document.getElementById('sof_kosuyaDahilAlani');
    var baslik = baslikEl.value.trim();
    hataAlani.innerHTML = '';
    soruAlani.innerHTML = '';
    if (!baslik) {
      hataAlani.innerHTML = '<p class="senaryo-form-hata">Başlık boş olamaz.</p>';
      return;
    }
    if (!SENARYO_OLUSTUR_SON_SONUC) return;

    soruAlani.innerHTML =
      '<p class="kosuya-dahil-soru" id="sof_kosuyaDahilSoru">Bu senaryo koşuya dahil edilsin mi?</p>' +
      '<div class="senaryo-form-buton-satir" role="group" aria-labelledby="sof_kosuyaDahilSoru">' +
        '<button type="button" id="sof_kosuyaDahilEvet" class="birincil">Evet, dahil et</button>' +
        '<button type="button" id="sof_kosuyaDahilHayir">Hayır, dahil etme</button>' +
      '</div>';
    document.getElementById('sof_kosuyaDahilEvet').addEventListener('click', function () { senaryoOlusturKaydetGonder(baslik, true); });
    document.getElementById('sof_kosuyaDahilHayir').addEventListener('click', function () { senaryoOlusturKaydetGonder(baslik, false); });
    document.getElementById('sof_kosuyaDahilEvet').focus();
  }

  function senaryoOlusturKaydetGonder(baslik, kosuyaDahil) {
    var hataAlani = document.getElementById('sof_kaydetHataAlani');
    var onayButonu = document.getElementById('sof_kaydetOnayButonu');
    var evetButonu = document.getElementById('sof_kosuyaDahilEvet');
    var hayirButonu = document.getElementById('sof_kosuyaDahilHayir');
    hataAlani.innerHTML = '';
    onayButonu.disabled = true;
    evetButonu.disabled = true;
    hayirButonu.disabled = true;
    onayButonu.textContent = 'Kaydediliyor...';

    fetch(TEST_SUNUCU.taban + '/jetseyahat-senaryo/kaydet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ortam: ORTAM, senaryo: SENARYO_OLUSTUR_SON_SONUC.veri, baslik: baslik, kosuyaDahil: kosuyaDahil, token: TEST_SUNUCU.token })
    })
      .then(function (yanit) { return yanit.json(); })
      .catch(function () { return { basarili: false, mesaj: 'Test sunucusuna ulaşılamadı.' }; })
      .then(function (sonuc) {
        onayButonu.disabled = false;
        evetButonu.disabled = false;
        hayirButonu.disabled = false;
        onayButonu.textContent = 'Kaydet';
        if (sonuc && sonuc.basarili) {
          document.getElementById('sof_kaydetAlani').innerHTML =
            '<p style="color:var(--good);font-weight:700;font-size:12.5px;">Kaydedildi' +
            (kosuyaDahil ? ' ve koşuya dahil edildi' : '; koşuya dahil edilmedi (Senaryolar tablosunda "Koşuda" anahtarıyla sonradan eklenebilir)') +
            '. "Senaryolar" listesinde görünmesi için dashboard sayfasını yeniden üretip (npm run rapor:' + escapeHtml(ORTAM) + ') tarayıcıyı yenileyin.</p>';
        } else if (sonuc && Array.isArray(sonuc.hatalar)) {
          // Sunucu doğrulaması (tek doğrulayıcı) reddetti: alanlarda + formun özet alanında.
          formBulgulariniGoster(sonuc, document.getElementById('sof_hataAlani'));
          hataAlani.innerHTML = '<p class="senaryo-form-hata">Kaydedilemedi: formdaki işaretli alanları düzeltin.</p>';
        } else {
          hataAlani.innerHTML = '<p class="senaryo-form-hata">' + escapeHtml((sonuc && sonuc.mesaj) || 'Kaydedilemedi.') + '</p>';
        }
      });
  }

  // ------------------------------------------------------------------------------
  // "✎ Düzenle" (Senaryolar tablosundaki her satır)
  //  - JetSeyahat (prim-hesaplama.spec.ts): senaryonun GÜNCEL kaydı sunucudan
  //    (/senaryo-getir) alınır ve AYNI "Senaryo Oluştur" formu düzenleme modunda,
  //    doldurulmuş olarak açılır. "Değişiklikleri Kaydet" → /senaryo-guncelle (kayıt
  //    jet-seyahat.json'da yerinde güncellenir), ardından dashboard yeniden üretilir.
  //  - Diğer ürünler: senaryolar kodda/ürün verisinde tanımlı olduğundan yalnızca salt
  //    okunur bir özet ve "Koşuya dahil" anahtarı (/kosu-listesi) gösterilir.
  // ------------------------------------------------------------------------------
  var JETSEYAHAT_SPEC_DOSYASI = 'scenarios/jet-seyahat/prim-hesaplama.spec.ts';

  function senaryoDuzenleAc(anahtar) {
    var senaryo = (VERI.tumSenaryolar || []).find(function (s) { return senaryoAnahtari(s) === anahtar; });
    if (!senaryo) return;
    if (kosuListesiAnahtarNormalize(anahtar).indexOf(JETSEYAHAT_SPEC_DOSYASI + SENARYO_ANAHTAR_AYRACI) === 0) {
      jetSeyahatDuzenleAc(anahtar, senaryo.ad);
    } else {
      senaryoDuzenleBasitModalAc(senaryo);
    }
  }

  // Tablo rozetiyle AYNI etiket (bkz. tests/support/beklenen-sonuc.ts > beklenenSonucEtiketi).
  function beklenenSonucEtiketiClient(f) {
    var bs = (f && f.beklenenSonuc) || { tip: 'basarili' };
    if (bs.tip !== 'isKuraliHatasi') return f && f.odemeAdimiDahil ? 'Ödeme' : 'Teklif';
    var adimAdlari = { primHesaplama: 'Prim', policelestirme: 'Poliçeleştirme', odeme: 'Ödeme' };
    return 'Hata: ' + (adimAdlari[bs.adim] || bs.adim || '?');
  }

  // Formu önce "yükleniyor" durumunda açar; /senaryo-getir ve hazır profil listesi
  // (/jetseyahat-yardimci-veri) İKİSİ de gelince formu düzenleme modunda çizer — profil
  // listesi önce gelmezse ettiren/sigortalı profil seçimleri doldurulamazdı.
  function jetSeyahatDuzenleAc(anahtar, baslik) {
    var icerikAlani = document.getElementById('senaryoOlusturModalIcerik');
    SENARYO_DUZENLE = null;
    icerikAlani.innerHTML =
      '<p class="modal-baslik">JetSeyahat — Senaryoyu Düzenle</p>' +
      '<p class="modal-alt">Senaryonun güncel kaydı yükleniyor...</p>';
    document.getElementById('senaryoOlusturModalOrtu').classList.add('acik');

    var getirIstegi = fetch(TEST_SUNUCU.taban + '/senaryo-getir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ortam: ORTAM, token: TEST_SUNUCU.token, baslik: baslik })
    })
      .then(function (yanit) { return yanit.json(); })
      .catch(function () {
        return { basarili: false, mesaj: 'Test sunucusuna ulaşılamadı. Bir terminalde "npm run test-sunucu" çalıştırıp tekrar deneyin.' };
      });
    Promise.all([getirIstegi, senaryoOlusturYardimciVeriYukle()]).then(function (sonuclar) {
      var getir = sonuclar[0];
      if (!document.getElementById('senaryoOlusturModalOrtu').classList.contains('acik')) return;
      if (!getir || !getir.basarili || !getir.senaryo) {
        icerikAlani.innerHTML =
          '<p class="modal-baslik">JetSeyahat — Senaryoyu Düzenle</p>' +
          '<p class="senaryo-form-hata">Senaryo yüklenemedi: ' + escapeHtml((getir && getir.mesaj) || 'bilinmeyen hata') + '</p>';
        return;
      }
      senaryoOlusturModalAc({ anahtar: anahtar, getir: getir });
    });
  }

  // Select'te değer yoksa (ör. elle yazılmış eski bir değer) kaybolmasın diye seçenek eklenir.
  function secimDegeriniAyarla(select, deger, ekEtiket) {
    if (!select || deger === undefined || deger === null || deger === '') return;
    var varMi = Array.prototype.some.call(select.options, function (o) { return o.value === String(deger); });
    if (!varMi) {
      var secenek = document.createElement('option');
      secenek.value = String(deger);
      secenek.textContent = String(deger) + (ekEtiket || '');
      select.appendChild(secenek);
    }
    select.value = String(deger);
  }

  // kimlikAltBlokCiz ile çizilmiş bir ettiren/sigortalı bloğunu kayıttaki profil anahtarı
  // ya da serbest kimlik nesnesiyle doldurur.
  function kimlikBlokDoldur(alanOnEki, profil, kimlik) {
    var el = function (id) { return document.getElementById(id); };
    if (profil) {
      secimDegeriniAyarla(el(alanOnEki + 'Profili'), profil, ' (profil listesinde yok)');
      return;
    }
    if (!kimlik) return;
    var serbestRadyo = document.querySelector('[name="' + alanOnEki + 'Kaynak"][value="serbest"]');
    if (serbestRadyo) {
      serbestRadyo.checked = true;
      serbestRadyo.dispatchEvent(new Event('change'));
    }
    var alanlar = { Tc: kimlik.tcKimlikNo, Dogum: kimlik.dogumTarihi, Telefon: kimlik.cepTelefonu, Vkn: kimlik.vergiKimlikNo };
    Object.keys(alanlar).forEach(function (ek) {
      if (el(alanOnEki + ek) && alanlar[ek] !== undefined) el(alanOnEki + ek).value = alanlar[ek];
    });
  }

  // /senaryo-getir > formVerisi (beklenen sonuç alanları sunucuda denetlenmiş,
  // acente kodu çözülmüş) ile formu doldurur.
  function senaryoFormunuDoldur(f) {
    var el = function (id) { return document.getElementById(id); };
    secimDegeriniAyarla(el('sof_kapsam'), f.kapsam);
    senaryoOlusturAlternatifleriGuncelle();
    secimDegeriniAyarla(el('sof_alternatif'), f.alternatif);
    secimDegeriniAyarla(el('sof_covid'), f.covidTeminati);
    secimDegeriniAyarla(el('sof_sorguTipi'), f.sorguTipi);

    // Senaryoya özel yüklenmiş Excel: yeni bir yükleme yapılmış gibi tutulur ki kaydederken
    // aynen geri gönderilsin; "Özel dosyayı kaldır" ile ürünün sabit dosyasına dönülür.
    SENARYO_OLUSTUR_COKLU_SORGU_YUKLEME = null;
    if (f.cokluSorguDosyasi) {
      var dosyaAdi = String(f.cokluSorguDosyasi).split('/').pop();
      SENARYO_OLUSTUR_COKLU_SORGU_YUKLEME = { dosyaYolu: f.cokluSorguDosyasi, dosyaAdi: dosyaAdi };
      if (f.cokluSorguKisiSayisi) el('sof_cokluSorguKisiSayisi').value = f.cokluSorguKisiSayisi;
      el('sof_cokluSorguDurum').innerHTML =
        '<p class="senaryo-form-yardim">Bu senaryoya özel dosya: ' + escapeHtml(dosyaAdi) +
        ' <button type="button" class="senaryo-duzenle-buton" id="sof_cokluSorguKaldir">Özel dosyayı kaldır</button></p>';
      el('sof_cokluSorguKaldir').addEventListener('click', function () {
        SENARYO_OLUSTUR_COKLU_SORGU_YUKLEME = null;
        el('sof_cokluSorguDurum').innerHTML = '';
        el('sof_cokluSorguKisiSayisi').value = '';
        cokluSorguVarsayilanGuncelle();
        senaryoDuzenleDenemeNotunuGuncelle();
      });
    }
    cokluSorguAlaniGuncelle();

    el('sof_acenteKodu').value = f.acenteKodu || '';
    el('sof_acenteKullanicisi').value = f.acenteKullanicisi || '';
    el('sof_kayak').checked = !!f.kayakTeminati;

    secimDegeriniAyarla(el('sof_ettiren'), f.ettiren);
    ettirenAltBlokCiz();
    if (f.ettiren && f.ettiren !== 'ayni') {
      kimlikBlokDoldur('sof_ettiren', f.ettirenProfili, f.ettiren === 'farkliTuzel' ? f.ettirenTuzelKimligi : f.ettirenOzelKimligi);
    }

    el('sof_sigortaliTipi').value = f.sigortaliProfili || f.sigortaliKimligi ? 'farkli' : 'varsayilan';
    sigortaliAltBlokGuncelle();
    if (f.sigortaliProfili || f.sigortaliKimligi) kimlikBlokDoldur('sof_sigortali', f.sigortaliProfili, f.sigortaliKimligi);

    el('sof_odemeAdimiDahil').checked = !!f.odemeAdimiDahil;
    // Kart: senaryonun kendi kartı varsa o, yoksa ortak test kartı (yardımcı veri düzenleme
    // formu açılmadan ÖNCE yüklendi — bkz. jetSeyahatDuzenleAc).
    odemeKartiniDoldur(f.krediKarti || SENARYO_OLUSTUR_VARSAYILAN_KART);
    SENARYO_OLUSTUR_KART_DOLDURULDU = true;
    if (f.krediKarti) {
      el('sof_odemeVarsayilanNotu').textContent = 'Bu senaryoya özel bir kart kayıtlı. Alanları ortak test kartıyla aynı yaparsanız özel kart kaldırılır ve ortak kart kullanılır.';
    }
    var bs = f.beklenenSonuc || { tip: 'basarili' };
    var radyo = document.querySelector('[name="sof_beklenenSonucTipi"][value="' + (bs.tip === 'isKuraliHatasi' ? 'isKuraliHatasi' : 'basarili') + '"]');
    if (radyo) radyo.checked = true;
    beklenenSonucAlaniniGuncelle();
    if (bs.tip === 'isKuraliHatasi') {
      if (bs.adim) el('sof_beklenenHataAdimi').value = bs.adim;
      el('sof_beklenenHata').value = bs.mesaj || '';
    }
  }

  // Kaydet düğmesinin altındaki küçük not: formun o anki hâli "Senaryoyu Koş" ile denendi mi?
  function senaryoDuzenleDenemeNotunuGuncelle() {
    var notEl = document.getElementById('sof_denemeNotu');
    if (!notEl || !SENARYO_DUZENLE) return;
    var guncel = JSON.stringify(senaryoOlusturFormundanVeriTopla());
    var son = SENARYO_OLUSTUR_SON_SONUC;
    if (son && JSON.stringify(son.veri) === guncel) {
      var basariliMi = son.sonuc && son.sonuc.basarili && son.sonuc.durum === 'passed';
      notEl.textContent = 'Bu hâliyle denendi: ' + (basariliMi ? 'Başarılı.' : 'Başarısız — yine de kaydedebilirsiniz.');
    } else {
      notEl.textContent = 'Bu değişiklikler henüz denenmedi (kaydetmek için deneme şart değil).';
    }
  }

  function senaryoDuzenleKaydet() {
    var hataAlani = document.getElementById('sof_hataAlani');
    var kaydetAlani = document.getElementById('sof_duzenleKaydetAlani');
    hataAlani.innerHTML = '';
    kaydetAlani.innerHTML = '';
    var yeniBaslik = document.getElementById('sof_duzenleBaslik').value.trim();
    var veri = senaryoOlusturFormundanVeriTopla();
    // Başlık da doğrulanır (düzenleme formunda sof_duzenleBaslik alanına yazılır).
    if (!formBulgulariniGoster(senaryoFormuDogrula(Object.assign({}, veri, { baslik: yeniBaslik })), hataAlani)) return;
    if (senaryoCalisiyorMu(SENARYO_DUZENLE.anahtar)) {
      hataAlani.innerHTML = '<p class="senaryo-form-hata">Bu senaryo şu an koşuyor. Koşu bitince ya da durdurulunca tekrar kaydedin.</p>';
      return;
    }
    // Başlık değiştiyse önce sayfa içi bir uyarı gösterilir; kullanıcı AÇIKÇA onaylamadan
    // istek gönderilmez (onaydan sonra başlık yine değişirse tekrar sorulur).
    if (yeniBaslik !== SENARYO_DUZENLE.eskiBaslik && SENARYO_DUZENLE.onaylananBaslik !== yeniBaslik) {
      kaydetAlani.innerHTML =
        '<div class="senaryo-duzenle-uyari" role="alert">' +
          '<strong>Başlık değişiyor.</strong> Başlık değişirse bu senaryonun önceki koşu geçmişi yeni başlığa bağlanmaz; eski koşular eski adıyla görünmeye devam eder.' +
          '<div class="senaryo-form-buton-satir">' +
            '<button type="button" id="sof_baslikOnayButonu" class="birincil">Anladım, kaydet</button>' +
            '<button type="button" id="sof_baslikVazgecButonu">Vazgeç</button>' +
          '</div>' +
        '</div>';
      document.getElementById('sof_baslikOnayButonu').addEventListener('click', function () {
        SENARYO_DUZENLE.onaylananBaslik = yeniBaslik;
        senaryoDuzenleKaydet();
      });
      document.getElementById('sof_baslikVazgecButonu').addEventListener('click', function () {
        kaydetAlani.innerHTML = '';
      });
      document.getElementById('sof_baslikOnayButonu').focus();
      return;
    }
    senaryoDuzenleKaydetGonder(yeniBaslik, veri, document.getElementById('sof_duzenleKosuyaDahil').checked);
  }

  function senaryoDuzenleKaydetGonder(yeniBaslik, veri, kosuyaDahil) {
    var kaydetButonu = document.getElementById('sof_degisiklikleriKaydetButonu');
    var kaydetAlani = document.getElementById('sof_duzenleKaydetAlani');
    var hataAlani = document.getElementById('sof_hataAlani');
    kaydetButonu.disabled = true;
    kaydetButonu.textContent = 'Kaydediliyor...';
    var govde = {
      ortam: ORTAM,
      token: TEST_SUNUCU.token,
      eskiBaslik: SENARYO_DUZENLE.eskiBaslik,
      senaryo: Object.assign({}, veri, { baslik: yeniBaslik }),
      kosuyaDahil: kosuyaDahil
    };
    fetch(TEST_SUNUCU.taban + '/senaryo-guncelle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(govde)
    })
      .then(function (yanit) { return yanit.json(); })
      .catch(function () { return { basarili: false, mesaj: 'Test sunucusuna ulaşılamadı.' }; })
      .then(function (sonuc) {
        kaydetButonu.disabled = false;
        kaydetButonu.textContent = 'Değişiklikleri Kaydet';
        if (sonuc && !sonuc.basarili && Array.isArray(sonuc.hatalar)) {
          formBulgulariniGoster(sonuc, hataAlani);
          return;
        }
        if (!sonuc || !sonuc.basarili) {
          hataAlani.innerHTML = '<p class="senaryo-form-hata">Kaydedilemedi: ' + escapeHtml((sonuc && sonuc.mesaj) || 'bilinmeyen hata') + '</p>';
          return;
        }
        // Sonraki kayıtlar artık yeni başlığı hedefler.
        SENARYO_DUZENLE.eskiBaslik = (sonuc.senaryo && sonuc.senaryo.baslik) || yeniBaslik;
        SENARYO_DUZENLE.onaylananBaslik = null;
        kaydetAlani.innerHTML = '<p class="senaryo-duzenle-basarili" id="sof_duzenleBasariMesaji">Değişiklikler kaydedildi — tablolar güncelleniyor...</p>';
        senaryoDuzenleSonrasiRaporuGuncelle();
      });
  }

  // Kayıttan sonra dashboard'u yeniden ürettirir (/rapor-uret) ve "↻ Sayfayı yenile"
  // düğmesi gösterir (toplu koşu sonrasındaki akışla aynı; bkz. kosuSonrasiRaporuGuncelle).
  function senaryoDuzenleSonrasiRaporuGuncelle() {
    var mesajEl = document.getElementById('sof_duzenleBasariMesaji');
    fetch(TEST_SUNUCU.taban + '/rapor-uret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ortam: ORTAM, token: TEST_SUNUCU.token })
    })
      .then(function (yanit) { return yanit.json(); })
      .catch(function () { return { basarili: false, mesaj: 'Test sunucusuna ulaşılamadı.' }; })
      .then(function (veri) {
        if (!mesajEl) return;
        if (!veri || !veri.basarili) {
          mesajEl.textContent = 'Değişiklikler kaydedildi, ancak tablolar güncellenemedi — terminalde "npm run rapor:' + ORTAM + '" çalıştırıp sayfayı yenileyin.';
          return;
        }
        mesajEl.textContent = 'Değişiklikler kaydedildi, tablolar güncellendi.';
        var yenile = document.createElement('button');
        yenile.type = 'button';
        yenile.className = 'senaryo-toplu-buton senaryo-toplu-buton-vurgulu';
        yenile.textContent = '↻ Sayfayı yenile';
        yenile.addEventListener('click', function () { location.reload(); });
        mesajEl.appendChild(yenile);
        yenile.focus();
      });
  }

  // JetSeyahat dışındaki ürünler: salt okunur özet + "Koşuya dahil".
  function senaryoDuzenleBasitModalAc(senaryo) {
    var anahtar = senaryoAnahtari(senaryo);
    var icerikAlani = document.getElementById('senaryoDuzenleModalIcerik');
    icerikAlani.innerHTML =
      '<p class="modal-baslik" id="senaryoDuzenleModalBaslik">' + escapeHtml(senaryo.urun) + ' — Senaryoyu Düzenle</p>' +
      '<p class="modal-alt eski-duzenleyici-notu" role="note"><strong>Eski düzenleyici</strong> — yalnızca proje DOSYALARINA yazar ve kaldırılacak. Senaryoları platformdaki <strong>Senaryolar</strong> sekmesinden oluşturup düzenleyin (veritabanı).</p>' +
      '<dl class="senaryo-duzenle-ozet">' +
        '<dt>Ürün</dt><dd>' + escapeHtml(senaryo.urun) + '</dd>' +
        '<dt>Dosya</dt><dd>' + escapeHtml(senaryo.dosya) + '</dd>' +
        '<dt>Başlık</dt><dd>' + escapeHtml(senaryo.ad) + '</dd>' +
        (senaryo.beklenenSonuc ? '<dt>Beklenen sonuç</dt><dd>' + escapeHtml(senaryo.beklenenSonuc) + '</dd>' : '') +
      '</dl>' +
      '<div class="senaryo-form-alan"><label class="senaryo-form-checkbox"><input type="checkbox" id="sdm_kosuyaDahil"' + (kosuyaDahilMi(anahtar) ? ' checked' : '') + ' /> Koşuya dahil</label></div>' +
      '<p class="senaryo-form-yardim beklenen-sonuc-yardim">Bu ürünün diğer senaryo alanları kodda / ürün veri dosyasında tanımlıdır; tam düzenleme şu an yalnızca JetSeyahat için mevcut.</p>' +
      '<div id="sdm_mesajAlani" aria-live="polite"></div>' +
      '<div class="senaryo-form-buton-satir">' +
        '<button type="button" id="sdm_kaydetButonu" class="birincil">Kaydet</button>' +
        '<button type="button" id="sdm_vazgecButonu">Vazgeç</button>' +
      '</div>';
    document.getElementById('sdm_vazgecButonu').addEventListener('click', senaryoDuzenleBasitModalKapat);
    document.getElementById('sdm_kaydetButonu').addEventListener('click', function () {
      var kaydetButonu = document.getElementById('sdm_kaydetButonu');
      var mesajAlani = document.getElementById('sdm_mesajAlani');
      var dahil = document.getElementById('sdm_kosuyaDahil').checked;
      if (dahil === kosuyaDahilMi(anahtar)) {
        mesajAlani.innerHTML = '<p class="senaryo-form-yardim beklenen-sonuc-yardim">Değişiklik yok.</p>';
        return;
      }
      kaydetButonu.disabled = true;
      kaydetButonu.textContent = 'Kaydediliyor...';
      kosuListesiIstegiGonder([anahtar], dahil).then(function (sonuc) {
        kaydetButonu.disabled = false;
        kaydetButonu.textContent = 'Kaydet';
        if (!sonuc || !sonuc.basarili) {
          mesajAlani.innerHTML = '<p class="senaryo-form-hata">Kaydedilemedi: ' + escapeHtml((sonuc && sonuc.mesaj) || 'bilinmeyen hata') + '</p>';
          return;
        }
        if (dahil) KOSU_LISTESI_HARIC.delete(anahtar);
        else KOSU_LISTESI_HARIC.add(anahtar);
        senaryoTablosuCiz();
        mesajAlani.innerHTML = '<p class="senaryo-duzenle-basarili">Kaydedildi: senaryo ' + (dahil ? 'koşuya dahil edildi.' : 'koşudan çıkarıldı.') + '</p>';
      });
    });
    document.getElementById('senaryoDuzenleModalOrtu').classList.add('acik');
    document.getElementById('sdm_kosuyaDahil').focus();
  }

  function senaryoDuzenleBasitModalKapat() {
    document.getElementById('senaryoDuzenleModalOrtu').classList.remove('acik');
  }

  // Üst istatistik kartları: GENEL seçiliyken tüm ürünlerin son koşusu, bir ürün
  // seçiliyken sadece o ürünün son koşudaki sayıları gösterilir.
  var IKON_TOPLAM = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>';
  var IKON_BASARILI = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  var IKON_BASARISIZ = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
  var IKON_ATLANAN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>';

  // deger null ise (görünüm için henüz koşu yok) "—" gösterilir; delta null ise fark
  // satırı hiç çizilmez. deltaEtiketi: farkın neye göre olduğu ("önceki koşu" tarihi vb.).
  function statTileClient(etiket, deger, delta, iyiYonAzalmaMi, ikon, deltaEtiketi) {
    var deltaHtml = '';
    if (delta !== null && deger !== null) {
      var isaret = delta > 0 ? '+' : '';
      var iyiMi = iyiYonAzalmaMi ? delta <= 0 : delta >= 0;
      var renkSinifi = delta === 0 ? 'delta-notr' : iyiMi ? 'delta-iyi' : 'delta-kotu';
      deltaHtml = '<div class="stat-delta ' + renkSinifi + '">' + isaret + delta + (deltaEtiketi ? ' <span class="stat-delta-etiket">(' + escapeHtml(deltaEtiketi) + ')</span>' : '') + '</div>';
    }
    return (
      '<div class="stat-tile">' +
      '<div class="stat-tile-ust"><div class="stat-label">' + escapeHtml(etiket) + '</div><div class="stat-ikon">' + ikon + '</div></div>' +
      '<div class="stat-value' + (deger === null ? ' stat-value-bos' : '') + '">' + (deger === null ? '—' : deger) + '</div>' +
      deltaHtml +
      '</div>'
    );
  }

  var BOS_KOSU_TOPLAM = { basarili: 0, basarisiz: 0, atlanan: 0, durduruldu: 0 };

  function kapsamMetni(kapsam) {
    return !kapsam || kapsam === 'Genel' ? 'Genel koşu' : kapsam + ' koşusu';
  }

  // Üst kartlar (hesap sunucuda — bkz. urun-hata-raporu.mjs > "Üst kartlar"):
  //  - Genel: her ürünün kendi son koşusundaki sayıların toplamı (güncel durum); fark,
  //    her ürünün bir önceki koşusunun toplamına göre.
  //  - Ürün P: P'yi içeren son koşudaki yalnızca P sayıları; fark, P'yi içeren bir önceki koşuya göre.
  // Görünüm için hiç koşu yoksa kartlar "—", kaynak satırı "Henüz koşu yok" gösterir.
  // Tekil koşular (Seçilenleri çalıştır, tek ▷, aramalı koşu) kartları değiştirmez.
  function istatKartlariniGuncelle() {
    var genelMi = secilenUrun === GENEL;
    var kartlar = VERI.kartlar || { genel: null, urunler: {} };
    var kaynakEl = document.getElementById('statKaynak');
    var son = null;
    var onceki = null;
    var deltaEtiketi = '';
    if (genelMi) {
      var genel = kartlar.genel;
      if (genel) {
        son = genel.son;
        onceki = genel.onceki;
        deltaEtiketi = 'önceki koşulara göre';
        kaynakEl.textContent = genel.urunSayisi > 1 && genel.enYeniZ !== genel.enEskiZ
          ? 'Güncel durum: her ürünün son koşusu (' + genel.urunSayisi + ' ürün; ' + genel.enEskiEtiket + ' – ' + genel.enYeniEtiket + ')'
          : 'Güncel durum — son koşu: ' + genel.enYeniEtiket;
      } else {
        kaynakEl.textContent = 'Henüz koşu yok — "▷ Koşuyu başlat" ile ya da terminalden bir koşu yapıldığında kartlar dolar.';
      }
    } else {
      var urunKart = kartlar.urunler[secilenUrun];
      if (urunKart) {
        son = urunKart.son;
        onceki = urunKart.onceki;
        deltaEtiketi = onceki ? onceki.etiket : '';
        kaynakEl.textContent = 'Son koşu: ' + son.etiket + ' (' + kapsamMetni(son.kapsam) + ')' +
          (onceki ? ' · önceki: ' + onceki.etiket + ' (' + kapsamMetni(onceki.kapsam) + ')' : '');
      } else {
        kaynakEl.textContent = 'Henüz koşu yok — ' + secilenUrun + ' için bir koşu yapıldığında kartlar dolar.';
      }
    }

    function sayi(n, alan) { return n ? n[alan] || 0 : null; }
    function fark(alan) { return son && onceki ? (son[alan] || 0) - (onceki[alan] || 0) : null; }
    var toplam = son ? son.basarili + son.basarisiz + son.atlanan + (son.durduruldu || 0) : null;
    var toplamOnceki = onceki ? onceki.basarili + onceki.basarisiz + onceki.atlanan + (onceki.durduruldu || 0) : null;
    var sonDurduruldu = son ? son.durduruldu || 0 : 0;
    var oncekiDurduruldu = onceki ? onceki.durduruldu || 0 : 0;

    document.getElementById('statGrid').innerHTML =
      statTileClient(genelMi ? 'Toplam test (güncel)' : 'Toplam test (son koşu)', toplam, son && onceki ? toplam - toplamOnceki : null, false, IKON_TOPLAM, deltaEtiketi) +
      statTileClient('Başarılı', sayi(son, 'basarili'), fark('basarili'), false, IKON_BASARILI, deltaEtiketi) +
      statTileClient('Başarısız', sayi(son, 'basarisiz'), fark('basarisiz'), true, IKON_BASARISIZ, deltaEtiketi) +
      statTileClient('Atlanan', sayi(son, 'atlanan'), fark('atlanan'), true, IKON_ATLANAN, deltaEtiketi) +
      // "Durduruldu" kartı yalnızca son/önceki koşuda durdurulan test varsa gösterilir (nötr, gri).
      (sonDurduruldu || oncekiDurduruldu
        ? statTileClient('Durduruldu', sonDurduruldu, null, true, IKON_ATLANAN, '') // delta renklendirilmez: nötr durum
        : '');
  }

  // Trend serisi için koşu filtresi: Genel → yalnızca 'Genel' kapsamlı tam koşular (tüm
  // ürünleri kapsayan, birbiriyle karşılaştırılabilir koşular); ürün P → P'nin sonucunu
  // içeren TÜM tam koşular (P kapsamlı ya da Genel), yalnızca P'nin sayılarıyla.
  function trendKosusuMu(k, genelMi) {
    if (k.tur === 'tekil') return false;
    if (genelMi) return (k.kapsam || 'Genel') === 'Genel';
    var n = k.urunler[secilenUrun];
    return !!n && n.basarili + n.basarisiz + n.atlanan + (n.durduruldu || 0) > 0;
  }

  // Koşu trendi grafiği: sunucu tarafında üretilen svg mantığının istemci karşılığı
  // — GENEL veya seçili ürüne göre farklı seri çizer.
  function trendSvgOlusturClient(seriler) {
    if (seriler.length < 2) {
      return '<div class="bos-durum">Trend grafiği için en az 2 koşu gerekir — daha fazla koşu biriktikçe burada görünecek.</div>';
    }

    var genislik = 900, yukseklik = 220, solPad = 34, sagPad = 12, ustPad = 16, altPad = 34;
    var cizimGenislik = genislik - solPad - sagPad;
    var cizimYukseklik = yukseklik - ustPad - altPad;
    var maxDeger = 1;
    seriler.forEach(function (s) {
      if (s.basarili > maxDeger) maxDeger = s.basarili;
      if (s.basarisiz > maxDeger) maxDeger = s.basarisiz;
    });
    var adimX = cizimGenislik / (seriler.length - 1);

    function nokta(i, deger) {
      return [solPad + i * adimX, ustPad + cizimYukseklik - (deger / maxDeger) * cizimYukseklik];
    }
    function cizgiYolu(anahtar) {
      return seriler.map(function (s, i) { var n = nokta(i, s[anahtar]); return (i === 0 ? 'M' : 'L') + n[0].toFixed(1) + ',' + n[1].toFixed(1); }).join(' ');
    }
    function alanYolu(anahtar) {
      var ustCizgi = cizgiYolu(anahtar);
      var sonX = nokta(seriler.length - 1, 0)[0];
      var ilkX = nokta(0, 0)[0];
      var tabanY = (ustPad + cizimYukseklik).toFixed(1);
      return ustCizgi + ' L' + sonX.toFixed(1) + ',' + tabanY + ' L' + ilkX.toFixed(1) + ',' + tabanY + ' Z';
    }

    var izgara = [0, 0.25, 0.5, 0.75, 1]
      .map(function (oran) {
        var y = ustPad + cizimYukseklik - oran * cizimYukseklik;
        var deger = Math.round(oran * maxDeger);
        return '<line x1="' + solPad + '" y1="' + y.toFixed(1) + '" x2="' + (genislik - sagPad) + '" y2="' + y.toFixed(1) + '" stroke="var(--gridline)" stroke-width="1" /><text x="' + (solPad - 8) + '" y="' + (y + 3.5).toFixed(1) + '" font-size="10" fill="var(--text-muted)" text-anchor="end">' + deger + '</text>';
      })
      .join('');

    var noktalar = seriler
      .map(function (s, i) {
        var nb = nokta(i, s.basarili);
        var nk = nokta(i, s.basarisiz);
        return (
          '<circle cx="' + nb[0].toFixed(1) + '" cy="' + nb[1].toFixed(1) + '" r="3.2" fill="var(--good)"><title>' + escapeHtml(s.etiket) + ' — Başarılı: ' + s.basarili + '</title></circle>' +
          '<circle cx="' + nk[0].toFixed(1) + '" cy="' + nk[1].toFixed(1) + '" r="3.2" fill="var(--critical)"><title>' + escapeHtml(s.etiket) + ' — Başarısız: ' + s.basarisiz + '</title></circle>'
        );
      })
      .join('');

    var etiketAraligi = Math.ceil(seriler.length / 8);
    var etiketler = seriler
      .map(function (s, i) {
        if (i % etiketAraligi !== 0 && i !== seriler.length - 1) return '';
        var x = nokta(i, 0)[0];
        return '<text x="' + x.toFixed(1) + '" y="' + (yukseklik - 10) + '" font-size="10" fill="var(--text-muted)" text-anchor="middle">' + escapeHtml(s.etiketKisa) + '</text>';
      })
      .join('');

    return (
      '<svg viewBox="0 0 ' + genislik + ' ' + yukseklik + '" class="trend-svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Koşu trendi grafiği">' +
      izgara +
      '<path d="' + alanYolu('basarisiz') + '" fill="var(--critical)" fill-opacity="0.08" stroke="none" />' +
      '<path d="' + alanYolu('basarili') + '" fill="var(--good)" fill-opacity="0.08" stroke="none" />' +
      '<path d="' + cizgiYolu('basarisiz') + '" fill="none" stroke="var(--critical)" stroke-width="2" />' +
      '<path d="' + cizgiYolu('basarili') + '" fill="none" stroke="var(--good)" stroke-width="2" />' +
      noktalar +
      etiketler +
      '</svg>'
    );
  }

  function trendGrafiginiGuncelle() {
    var genelMi = secilenUrun === GENEL;
    var aralik = secilenTarihAraligi('baslangicTarihiTrend', 'bitisTarihiTrend');
    // Trend yalnızca TAM koşularla çizilir — dashboard'dan tek senaryo koşuları (tekil,
    // toplam=1) çizgiyi anlamsızca 0-1'e çekmesin.
    var seriler = VERI.kosuGecmisi
      .filter(function (k) { return trendKosusuMu(k, genelMi) && k.z >= aralik.baslangicMs && k.z <= aralik.bitisMs; })
      .map(function (k) {
        var n = genelMi ? k : k.urunler[secilenUrun] || BOS_KOSU_TOPLAM;
        return { etiket: k.etiket, etiketKisa: k.etiketKisa, basarili: n.basarili, basarisiz: n.basarisiz };
      });
    document.getElementById('trendSvgAlani').innerHTML = trendSvgOlusturClient(seriler);
    document.getElementById('secimOzetiTrend').textContent = seriler.length + ' koşu';
    document.getElementById('trendBaslikSayisi').textContent = seriler.length + ' koşu';
    document.getElementById('trendAltBaslik').textContent =
      genelMi
        ? 'Seçili tarih aralığındaki ' + seriler.length + ' Genel koşuda (tüm ürünler) başarılı/başarısız sayısı nasıl değişti — ürün kapsamlı ve tekil koşular dahil değil'
        : 'Seçili tarih aralığında ' + secilenUrun + ' ürününü içeren ' + seriler.length + ' koşuda (ürün ya da Genel kapsamlı) ' + secilenUrun + ' sayıları';
  }

  // "Koşu geçmişi" tablosu: seçilen tarih aralığındaki TÜM koşuları (en yeni önce)
  // GENEL veya seçili ürüne göre listeler, 10'ar satırlık sayfalar halinde.
  function kosuGecmisiniGuncelle() {
    var genelMi = secilenUrun === GENEL;
    var aralik = secilenTarihAraligi('baslangicTarihiKosu', 'bitisTarihiKosu');

    var kosular = VERI.kosuGecmisi
      .map(function (k, i) { return { k: k, i: i }; }) // filtrelemeden önce VERI.kosuGecmisi/kosuDetaylari ile eşleşen orijinal index'i sakla
      .filter(function (x) { return x.k.z >= aralik.baslangicMs && x.k.z <= aralik.bitisMs; })
      .map(function (x) {
        var k = x.k;
        var n = genelMi ? k : k.urunler[secilenUrun] || BOS_KOSU_TOPLAM;
        var durduruldu = n.durduruldu || 0;
        // Oran paydası "Durduruldu"yu içermez (başarısızlık gibi oranı düşürmesin).
        var oranPaydasi = n.basarili + n.basarisiz + n.atlanan;
        var toplam = oranPaydasi + durduruldu;
        var oran = oranPaydasi > 0 ? Math.round((n.basarili / oranPaydasi) * 100) : 0;
        // GENEL görünümde, koşunun hangi ürünleri kapsadığını satırda rozet olarak
        // göstermek için ürün kırılımını da taşıyoruz (tek ürün seçiliyken gereksiz,
        // zaten o üründe olduğumuz belli).
        return { orijinalIndex: x.i, etiket: k.etiket, tekilMi: k.tur === 'tekil', kapsam: k.tur === 'tekil' ? null : k.kapsam || 'Genel', z: k.z, basarili: n.basarili, basarisiz: n.basarisiz, atlanan: n.atlanan, durduruldu: durduruldu, toplam: toplam, oran: oran, urunler: genelMi ? k.urunler : null };
      });

    var durumKosu = SIRALAMA_DURUMU.kosuGecmisi;
    var DEGER_FN_KOSU = {
      z: function (r) { return r.z; },
      toplam: function (r) { return r.toplam; },
      basarili: function (r) { return r.basarili; },
      basarisiz: function (r) { return r.basarisiz; },
      atlanan: function (r) { return r.atlanan; },
      durduruldu: function (r) { return r.durduruldu; },
      oran: function (r) { return r.oran; }
    };
    kosular = diziyiSirala(kosular, durumKosu.anahtar, durumKosu.yon, DEGER_FN_KOSU[durumKosu.anahtar]);
    siralamaOklariniGuncelle();

    var ozetAlani = document.getElementById('secimOzetiKosu');
    ozetAlani.textContent = kosular.length + ' koşu';
    document.getElementById('kosuGecmisiBaslikSayisi').textContent = kosular.length + ' koşu';

    var govde = document.getElementById('kosuGecmisiGovdesi');
    var sayfalamaAlani = document.getElementById('kosuGecmisiSayfalama');

    if (kosular.length === 0) {
      govde.innerHTML = '<tr><td colspan="8">Seçilen tarih aralığında koşu yok</td></tr>';
      sayfalamaAlani.innerHTML = '';
      ikizTablolarinYuksekliginiEsitle();
      return;
    }

    var toplamSayfa = Math.max(1, Math.ceil(kosular.length / KOSU_GECMISI_SAYFA_BOYUTU));
    if (kosuGecmisiSayfa > toplamSayfa) kosuGecmisiSayfa = toplamSayfa;
    if (kosuGecmisiSayfa < 1) kosuGecmisiSayfa = 1;

    var baslangicIdx = (kosuGecmisiSayfa - 1) * KOSU_GECMISI_SAYFA_BOYUTU;
    var sayfaKosulari = kosular.slice(baslangicIdx, baslangicIdx + KOSU_GECMISI_SAYFA_BOYUTU);

    govde.innerHTML = sayfaKosulari
      .map(function (k) {
        var toplam = k.toplam;
        var oran = k.oran;
        var barRengi = oran >= 80 ? 'var(--good)' : oran >= 50 ? 'var(--warning)' : 'var(--critical)';

        // Ürün rozetleri: GENEL görünümde bu koşuda hangi ürünlerin çalıştığını ve
        // her birinin başarısız/toplam sayısını gösterir. Hiç testi olmayan ürünler
        // (toplamı 0) gösterilmez.
        var urunRozetleri = '';
        if (k.urunler) {
          urunRozetleri = Object.keys(k.urunler)
            .sort(function (a, b) { return a.localeCompare(b, 'tr'); })
            .map(function (urunAdi) {
              var u = k.urunler[urunAdi];
              var uToplam = u.basarili + u.basarisiz + u.atlanan + (u.durduruldu || 0);
              if (uToplam === 0) return '';
              var sinif = u.basarisiz > 0 ? 'rozet-kritik' : 'rozet-iyi';
              return '<span class="rozet ' + sinif + '">' + escapeHtml(urunAdi) + ' <b>' + u.basarisiz + '/' + uToplam + '</b></span>';
            })
            .join('');
        }

        return (
          '<tr class="kosu-satir" data-kosu-index="' + k.orijinalIndex + '">' +
          '<td>' + escapeHtml(k.etiket) +
          (k.tekilMi ? '<span class="rozet rozet-notr rozet-tekil" title="Kısmi koşu (Seçilenleri çalıştır, tek ▷ ya da aramalı koşu) — üst kartları ve trendi değiştirmez">tekil</span>' : '') +
          (k.kapsam && k.kapsam !== 'Genel' ? '<span class="rozet rozet-kapsam rozet-tekil" title="Yalnızca bu ürünü kapsayan koşu — ürün kartlarını ve trendini günceller, Genel trende girmez">' + escapeHtml(k.kapsam) + ' koşusu</span>' : '') +
          '</td>' +
          '<td><div class="kosu-urun-rozetleri">' + (urunRozetleri || '<span class="bos-durum-mini">—</span>') + '</div></td>' +
          '<td class="num">' + toplam + '</td>' +
          '<td class="num">' + k.basarili + '</td>' +
          '<td class="num">' + k.basarisiz + '</td>' +
          '<td class="num">' + k.atlanan + '</td>' +
          '<td class="num">' + k.durduruldu + '</td>' +
          '<td class="num"><div class="oran-hucre"><div class="oran-bar"><div class="oran-dolum" style="width:' + oran + '%;background:' + barRengi + '"></div></div><span>%' + oran + '</span></div></td>' +
          '</tr>'
        );
      })
      .join('');

    Array.prototype.forEach.call(govde.querySelectorAll('.kosu-satir'), function (satir) {
      satir.addEventListener('click', function () {
        kosuDetayAc(Number(satir.getAttribute('data-kosu-index')));
      });
    });

    sayfalamaAlani.innerHTML =
      '<button type="button" id="kosuGecmisiOnceki"' + (kosuGecmisiSayfa <= 1 ? ' disabled' : '') + '>Önceki</button>' +
      '<span class="sayfa-bilgi">Sayfa ' + kosuGecmisiSayfa + ' / ' + toplamSayfa + '</span>' +
      '<button type="button" id="kosuGecmisiSonraki"' + (kosuGecmisiSayfa >= toplamSayfa ? ' disabled' : '') + '>Sonraki</button>';

    var oncekiDugme = document.getElementById('kosuGecmisiOnceki');
    var sonrakiDugme = document.getElementById('kosuGecmisiSonraki');
    if (oncekiDugme) oncekiDugme.addEventListener('click', function () { kosuGecmisiSayfa--; kosuGecmisiniGuncelle(); });
    if (sonrakiDugme) sonrakiDugme.addEventListener('click', function () { kosuGecmisiSayfa++; kosuGecmisiniGuncelle(); });
    ikizTablolarinYuksekliginiEsitle();
  }

  // Seçim (GENEL <-> ürün) her değiştiğinde ekranın tamamını tutarlı şekilde günceller.
  function secimGuncellendi() {
    urunNavCiz();
    document.getElementById('anaBaslik').textContent = secilenUrun === GENEL ? 'Genel Bakış' : secilenUrun;
    // "+ Senaryo Oluştur" butonu, şimdilik yalnızca JetSeyahat ürünü seçiliyken görünür
    // (server tarafında da sadece /jetseyahat-senaryo/* uçları var — bkz. test-sunucu.mjs).
    document.getElementById('senaryoOlusturButonu').style.display = secilenUrun === 'JetSeyahat' ? '' : 'none';
    document.getElementById('secilenUrunBasligi').textContent = secilenUrun === GENEL ? 'Hata kalıpları' : 'Hata kalıpları — ' + secilenUrun;
    istatKartlariniGuncelle();
    trendGrafiginiGuncelle();
    // NOT: kosuGecmisiSayfa/kalipSayfa burada SIFIRLANMAZ — bu fonksiyon her koşu
    // bitişinde de çağrılıyor; sıfırlama ürün değişiminde (urunNavCiz) ve tarih
    // filtresi değişiminde (kalipFiltresiDegisti/kosuGecmisiFiltresiDegisti) yapılır.
    kosuGecmisiniGuncelle();
    ikinciBolumuCiz();
    tabloyuGuncelle();
    senaryoTablosuCiz();
  }

  function kategoriDonutunuCiz(kategoriSayaclari, basarisiz) {
    var alan = document.getElementById('kategoriDonutAlani');
    var kategoriler = Object.keys(kategoriSayaclari).sort(function (a, b) { return kategoriSayaclari[b] - kategoriSayaclari[a]; });

    if (basarisiz === 0 || kategoriler.length === 0) {
      alan.innerHTML =
        '<div class="kategori-donut-sarma"><div class="kategori-donut-halka" style="background:var(--gridline)"></div>' +
        '<div class="kategori-donut-oyuk"><b>0</b><span>hata</span></div></div>' +
        '<div class="bos-durum" style="padding:10px;font-size:12px;">Seçili aralıkta hata yok 🎉</div>';
      return;
    }

    var birikimli = 0;
    var gradyanParcalari = kategoriler.map(function (kategori) {
      var adet = kategoriSayaclari[kategori];
      var baslangicYuzde = (birikimli / basarisiz) * 100;
      birikimli += adet;
      var bitisYuzde = (birikimli / basarisiz) * 100;
      return kategoriRengi(kategori) + ' ' + baslangicYuzde.toFixed(2) + '% ' + bitisYuzde.toFixed(2) + '%';
    });

    var lejantHtml = kategoriler
      .map(function (kategori) {
        var adet = kategoriSayaclari[kategori];
        var yuzde = Math.round((adet / basarisiz) * 100);
        return (
          '<div class="kategori-lejant-oge">' +
          '<span class="kategori-lejant-nokta" style="background:' + kategoriRengi(kategori) + '"></span>' +
          '<span class="kategori-lejant-ad">' + escapeHtml(kategori) + '</span>' +
          '<span class="kategori-lejant-adet">' + adet + ' <span style="color:var(--text-muted);font-weight:500;">(%' + yuzde + ')</span></span>' +
          '</div>'
        );
      })
      .join('');

    alan.innerHTML =
      '<div class="kategori-donut-sarma">' +
      '<div class="kategori-donut-halka" style="background:conic-gradient(' + gradyanParcalari.join(', ') + ')"></div>' +
      '<div class="kategori-donut-oyuk"><b>' + basarisiz + '</b><span>hata</span></div>' +
      '</div>' +
      '<div class="kategori-lejant">' + lejantHtml + '</div>';
  }

  function tabloyuGuncelle() {
    var alan = document.getElementById('kalipTablosuAlani');
    var sayfalamaAlani = document.getElementById('kalipTablosuSayfalama');
    var ozetAlani = document.getElementById('secimOzeti');
    var genelMi = secilenUrun === GENEL;

    var aralik = secilenTarihAraligi('baslangicTarihi', 'bitisTarihi');

    var urunKayitlari = VERI.kayitlar.filter(function (k) {
      return (genelMi || k.u === secilenUrun) && k.z >= aralik.baslangicMs && k.z <= aralik.bitisMs;
    });

    var basarili = 0, basarisiz = 0, atlanan = 0, durduruldu = 0;
    var kalipSayaclari = {}; // 'urun|||kategori|||kalip' -> { adet, urun, kategori, kalip }
    var kategoriSayaclari = {}; // kategori -> adet
    urunKayitlari.forEach(function (k) {
      if (k.d === 'basarili') basarili++;
      else if (k.d === 'atlanan') atlanan++;
      else if (k.d === 'durduruldu') durduruldu++; // başarısız sayılmaz, kalıba/kategoriye girmez
      else {
        basarisiz++;
        var anahtar = k.u + '|||' + k.k + '|||' + k.p;
        if (!kalipSayaclari[anahtar]) kalipSayaclari[anahtar] = { adet: 0, urun: k.u, kategori: k.k, kalip: k.p };
        kalipSayaclari[anahtar].adet++;
        kategoriSayaclari[k.k] = (kategoriSayaclari[k.k] || 0) + 1;
      }
    });

    ozetAlani.textContent = urunKayitlari.length + ' kayıt (Başarılı ' + basarili + ' · Başarısız ' + basarisiz + ' · Atlanan ' + atlanan + (durduruldu ? ' · Durduruldu ' + durduruldu : '') + ')';
    kategoriDonutunuCiz(kategoriSayaclari, basarisiz);

    var siraliKaliplar = Object.keys(kalipSayaclari)
      .map(function (anahtar) { return kalipSayaclari[anahtar]; })
      .sort(function (a, b) { return b.adet - a.adet; });

    document.getElementById('kalipBaslikSayisi').textContent = siraliKaliplar.length + ' kalıp toplam';

    if (siraliKaliplar.length === 0) {
      alan.innerHTML = '<div class="bos-durum">Seçilen tarih aralığında başarısız test yok. 🎉</div>';
      sayfalamaAlani.innerHTML = '';
      return;
    }

    var toplamKalipSayfa = Math.max(1, Math.ceil(siraliKaliplar.length / KALIP_SAYFA_BOYUTU));
    if (kalipSayfa > toplamKalipSayfa) kalipSayfa = toplamKalipSayfa;
    if (kalipSayfa < 1) kalipSayfa = 1;
    var kalipBaslangicIdx = (kalipSayfa - 1) * KALIP_SAYFA_BOYUTU;
    var sayfaKaliplari = siraliKaliplar.slice(kalipBaslangicIdx, kalipBaslangicIdx + KALIP_SAYFA_BOYUTU);

    alan.innerHTML = sayfaKaliplari
      .map(function (s, i) {
        var ornekAnahtari = s.urun + '|||' + s.kategori + '|||' + s.kalip;
        var ornek = VERI.ornekler[ornekAnahtari];
        var govdeIcerik = '';
        if (ornek) {
          govdeIcerik += '<div class="hata-ornek-etiket">Örnek: ' + escapeHtml(ornek.b) + (ornek.oz ? ' (' + escapeHtml(ornek.oz) + ')' : '') + ' — en son görülme: ' + escapeHtml(ornek.t) + '</div>';
          if (ornek.m) govdeIcerik += '<pre class="hata-mesaj">' + escapeHtml(ornek.m) + '</pre>';
          var kalipOlasiNeden = olasiNedenBul(ornek.m);
          if (kalipOlasiNeden) {
            govdeIcerik += '<div class="hata-ornek-etiket">Olası neden</div>';
            govdeIcerik += '<div class="olasi-neden">' + escapeHtml(kalipOlasiNeden) + '</div>';
          }
          if (ornek.g) govdeIcerik += '<img class="hata-goruntu" src="' + escapeHtml(ornek.g) + '" alt="Hata anı ekran görüntüsü" />';
          else govdeIcerik += '<div class="bos-durum">Bu kalıp için ekran görüntüsü bulunamadı.</div>';
          govdeIcerik += videoBaglantisiHtml(ornek.v);
        }
        return (
          '<details class="hata-detay"' + (i === 0 ? ' open' : '') + '>' +
          '<summary>' +
          '<span class="hata-adet">' + s.adet + '</span>' +
          '<span class="hata-kalip">' + escapeHtml(s.kalip) + '</span>' +
          (genelMi ? '<span class="rozet rozet-notr">' + escapeHtml(s.urun) + '</span>' : '') +
          '<span class="rozet rozet-kritik">' + escapeHtml(s.kategori) + '</span>' +
          '</summary>' +
          '<div class="hata-govde">' + govdeIcerik + '</div>' +
          '</details>'
        );
      })
      .join('');

    sayfalamaAlani.innerHTML =
      '<span class="sayfa-bilgi">' + siraliKaliplar.length + ' kalıptan ' + (kalipBaslangicIdx + 1) + '–' +
      Math.min(kalipBaslangicIdx + KALIP_SAYFA_BOYUTU, siraliKaliplar.length) + ' arası gösteriliyor</span>' +
      '<button type="button" id="kalipOnceki"' + (kalipSayfa <= 1 ? ' disabled' : '') + '>Önceki</button>' +
      '<span class="sayfa-bilgi">Sayfa ' + kalipSayfa + ' / ' + toplamKalipSayfa + '</span>' +
      '<button type="button" id="kalipSonraki"' + (kalipSayfa >= toplamKalipSayfa ? ' disabled' : '') + '>Sonraki</button>';

    var kalipOncekiDugme = document.getElementById('kalipOnceki');
    var kalipSonrakiDugme = document.getElementById('kalipSonraki');
    if (kalipOncekiDugme) kalipOncekiDugme.addEventListener('click', function () { kalipSayfa--; tabloyuGuncelle(); });
    if (kalipSonrakiDugme) kalipSonrakiDugme.addEventListener('click', function () { kalipSayfa++; tabloyuGuncelle(); });
  }

  // Kenar çubuğu daralt/genişlet: tercih tarayıcıda saklanır, sayfa yeniden
  // üretildiğinde/yenilendiğinde son durum korunur.
  (function () {
    var vizRoot = document.querySelector('.viz-root');
    var dugmeAlt = document.getElementById('kenarCubuguDugmesi');
    var dugmeUst = document.getElementById('kenarCubuguDugmesiUst');
    var ANAHTAR = 'urunHataRaporuKenarKapali';
    var kapaliMi = false;
    try { kapaliMi = localStorage.getItem(ANAHTAR) === '1'; } catch (e) { /* gizli sekme vb. — yoksay */ }
    if (kapaliMi) vizRoot.classList.add('kenar-kapali');
    function kenarCubugunuAcKapat() {
      var suAnKapaliMi = vizRoot.classList.toggle('kenar-kapali');
      try { localStorage.setItem(ANAHTAR, suAnKapaliMi ? '1' : '0'); } catch (e) { /* yoksay */ }
    }
    dugmeAlt.addEventListener('click', kenarCubugunuAcKapat);
    dugmeUst.addEventListener('click', kenarCubugunuAcKapat);
  })();

  // "Ürünler" başlığı: tıklanınca ürün listesi açılıp kapanır, tercih tarayıcıda saklanır.
  (function () {
    var baslikDugmesi = document.getElementById('urunListesiBasligi');
    var liste = document.getElementById('urunNav');
    var ANAHTAR = 'urunHataRaporuUrunListesiKapali';
    var kapaliMi = false;
    try { kapaliMi = localStorage.getItem(ANAHTAR) === '1'; } catch (e) { /* gizli sekme vb. — yoksay */ }
    function durumuUygula(kapali) {
      liste.classList.toggle('urun-nav-kapali', kapali);
      baslikDugmesi.setAttribute('aria-expanded', kapali ? 'false' : 'true');
    }
    durumuUygula(kapaliMi);
    baslikDugmesi.addEventListener('click', function () {
      kapaliMi = !kapaliMi;
      durumuUygula(kapaliMi);
      try { localStorage.setItem(ANAHTAR, kapaliMi ? '1' : '0'); } catch (e) { /* yoksay */ }
    });
  })();

  // Sayfa açılışı: varsayılan ekran GENEL (tüm ürünlerin özeti). Tüm tarih filtreleri
  // başlangıçta "tüm zamanlar" aralığıyla doldurulur.
  tarihSinirlariniAyarla('baslangicTarihi', 'bitisTarihi');
  tarihSinirlariniAyarla('baslangicTarihiKosu', 'bitisTarihiKosu');
  tarihSinirlariniAyarla('baslangicTarihiTrend', 'bitisTarihiTrend');
  tarihSinirlariniAyarla('baslangicTarihiUrun', 'bitisTarihiUrun');
  // "Koşu geçmişi"nde dashboard'dan tetiklenip localStorage'a kalıcı olarak yazılmış
  // (bkz. anlikKosuKaydiEkle) önceki koşuları geri getirir — secimGuncellendi()'den
  // ÖNCE çağrılır ki ilk çizimde bu kayıtlar da görünsün.
  anlikKosuDepoyuYukle();
  secimGuncellendi();
  document.getElementById('senaryoTablosuArama').addEventListener('input', function (olay) {
    SENARYO_TABLOSU_ARAMA = olay.target.value;
    senaryoTablosuSayfa = 1;
    senaryoTablosuCiz();
  });
  document.getElementById('senaryoTumunuSecCheckbox').addEventListener('change', function (olay) {
    var liste = senaryoTablosuFiltrelenmisListeyiGetir();
    if (olay.target.checked) liste.forEach(function (s) { SENARYO_TABLOSU_SECILI.add(senaryoAnahtari(s)); });
    else liste.forEach(function (s) { SENARYO_TABLOSU_SECILI.delete(senaryoAnahtari(s)); });
    senaryoTablosuCiz();
  });
  // "▷ Koşuyu başlat": görünümdeki (Genel → tüm ürünler, ürün seçiliyse o ürün) koşuya
  // DAHİL senaryoları sırayla koşar. Arama boşsa gerçek bir "koşu"dur (kosuTuru 'tam',
  // kosuKapsami = 'Genel' ya da ürün adı) ve kartları/trendi günceller; arama varsa yalnızca
  // eşleşenler koştuğu için kısmi (tekil) koşu sayılır. Zaten çalışan senaryolar (ör. koşu
  // detay penceresinden başlatılmış) ikinci kez başlatılmaz.
  document.getElementById('senaryoTumunuCalistirButonu').addEventListener('click', function () {
    var liste = kosuyaDahilGorunenAnahtarlar();
    var gorunen = senaryoTablosuFiltrelenmisListeyiGetir();
    var haricSayisi = gorunen.filter(function (s) { return !kosuyaDahilMi(senaryoAnahtari(s)); }).length;
    var aramaVarMi = !!SENARYO_TABLOSU_ARAMA.trim();
    topluKosuOnayiIste(liste, false, {
      kosuMu: true,
      tamKosuMu: !aramaVarMi,
      kapsam: secilenUrun === GENEL ? 'Genel' : secilenUrun,
      aramaVarMi: aramaVarMi,
      haricSayisi: haricSayisi
    });
  });
  document.getElementById('senaryoKosuyaEkleButonu').addEventListener('click', function () {
    kosuListesiniDegistir(kosuListesiSeciliAnahtarlar(true), true);
  });
  document.getElementById('senaryoKosudanCikarButonu').addEventListener('click', function () {
    kosuListesiniDegistir(kosuListesiSeciliAnahtarlar(false), false);
  });
  document.getElementById('senaryoSecilenleriCalistirButonu').addEventListener('click', function () {
    // Butondaki sayıyla birebir aynı liste (bkz. seciliCalistirilacakAnahtarlar).
    topluKosuOnayiIste(seciliCalistirilacakAnahtarlar(), true);
  });
  document.getElementById('topluKosuOnayIptal').addEventListener('click', topluKosuOnayKapat);
  document.getElementById('topluKosuOnayKapatButonu').addEventListener('click', topluKosuOnayKapat);
  document.getElementById('topluKosuOnayOrtu').addEventListener('click', function (olay) {
    if (olay.target.id === 'topluKosuOnayOrtu') topluKosuOnayKapat();
  });
  document.getElementById('topluKosuOnayBaslat').addEventListener('click', function () {
    var bekleyen = TOPLU_KOSU_ONAY_BEKLEYEN;
    topluKosuOnayKapat();
    if (!bekleyen) return;
    // Toplu koşu başlarken seçim temizlenir (topluKosuBaslat tabloyu yeniden çizer,
    // kutucuklar da boşalır) — aynı seçim yanlışlıkla tekrar koşulmasın.
    SENARYO_TABLOSU_SECILI.clear();
    topluKosuBaslat(bekleyen.senaryolar, bekleyen.esZamanliMi, bekleyen.tamKosuMu, bekleyen.kapsam);
  });
  document.getElementById('senaryoCanliPanelDurdurButonu').addEventListener('click', function (olay) {
    olay.target.closest('button').disabled = true;
    topluKosuDurdur();
  });

  function kalipFiltresiDegisti() {
    kalipSayfa = 1;
    tabloyuGuncelle();
  }
  document.getElementById('baslangicTarihi').addEventListener('change', kalipFiltresiDegisti);
  document.getElementById('bitisTarihi').addEventListener('change', kalipFiltresiDegisti);
  document.getElementById('tumZamanlarButonu').addEventListener('click', function () {
    tarihSinirlariniAyarla('baslangicTarihi', 'bitisTarihi');
    kalipFiltresiDegisti();
  });

  function kosuGecmisiFiltresiDegisti() {
    kosuGecmisiSayfa = 1;
    kosuGecmisiniGuncelle();
  }
  document.getElementById('baslangicTarihiKosu').addEventListener('change', kosuGecmisiFiltresiDegisti);
  document.getElementById('bitisTarihiKosu').addEventListener('change', kosuGecmisiFiltresiDegisti);
  document.getElementById('tumZamanlarButonuKosu').addEventListener('click', function () {
    tarihSinirlariniAyarla('baslangicTarihiKosu', 'bitisTarihiKosu');
    kosuGecmisiFiltresiDegisti();
  });

  document.getElementById('baslangicTarihiTrend').addEventListener('change', trendGrafiginiGuncelle);
  document.getElementById('bitisTarihiTrend').addEventListener('change', trendGrafiginiGuncelle);
  document.getElementById('tumZamanlarButonuTrend').addEventListener('click', function () {
    tarihSinirlariniAyarla('baslangicTarihiTrend', 'bitisTarihiTrend');
    trendGrafiginiGuncelle();
  });

  // Bu filtre hem üstteki "Ürün/Adım bazlı başarı" grafiğini hem altındaki tabloyu
  // (aynı veri) birlikte günceller — ikisi de ikinciBolumuCiz() içinden çizilir.
  document.getElementById('baslangicTarihiUrun').addEventListener('change', ikinciBolumuCiz);
  document.getElementById('bitisTarihiUrun').addEventListener('change', ikinciBolumuCiz);
  document.getElementById('tumZamanlarButonuUrun').addEventListener('click', function () {
    tarihSinirlariniAyarla('baslangicTarihiUrun', 'bitisTarihiUrun');
    ikinciBolumuCiz();
  });

  // Adım detay popup'ı: X butonu, karartılmış alana tıklama veya Escape ile kapanır.
  document.getElementById('adimDetayModalKapatButonu').addEventListener('click', adimDetayModalKapat);
  document.getElementById('adimDetayModalOrtu').addEventListener('click', function (olay) {
    if (olay.target === olay.currentTarget) adimDetayModalKapat();
  });

  // "Senaryolar" tablosundan tetiklenen çalıştırmanın sonuç popup'ı — aynı kurallarla kapanır.
  document.getElementById('senaryoSonucModalKapatButonu').addEventListener('click', senaryoSonucModalKapat);
  document.getElementById('senaryoSonucModalOrtu').addEventListener('click', function (olay) {
    if (olay.target === olay.currentTarget) senaryoSonucModalKapat();
  });

  // Toplu koşu "canlı panel"i — kapatılsa bile arka planda koşu devam eder (DOM'a
  // bağlı değil, Promise zincirleriyle yürür); kullanıcı istediğinde tekrar sonucu
  // görmek isterse en son "Koşuyu başlat"/"Seçilenleri çalıştır" ile tekrar açar.
  document.getElementById('senaryoCanliPanelKapatButonu').addEventListener('click', senaryoCanliPanelKapat);
  document.getElementById('senaryoCanliPanelOrtu').addEventListener('click', function (olay) {
    if (olay.target === olay.currentTarget) senaryoCanliPanelKapat();
  });
  // Sağ alttaki küçük rozete tıklanınca panel (o an çalışıyor olsun ya da bitmiş
  // olsun) aynı içerikle tekrar açılır — hâlâ çalışan satırlar varsa canlı görüntü
  // sorgulaması da (panel kapanınca durdurulmuştu) kaldığı yerden devam eder.
  document.getElementById('canliPanelKucukRozet').addEventListener('click', function () {
    document.getElementById('senaryoCanliPanelOrtu').classList.add('acik');
    canliPanelRozetGizle();
    Object.keys(CANLI_PANEL_CALISAN_INDEXLER).forEach(function (index) {
      var kayit = CANLI_PANEL_CALISAN_INDEXLER[index];
      canliPanelIzlemeyiBaslat(index, kayit.ad, kayit.kosuId);
    });
  });

  // "+ Senaryo Oluştur" popup'ı — aynı kurallarla kapanır (bkz. senaryoOlusturModalKapat).
  document.getElementById('senaryoOlusturModalKapatButonu').addEventListener('click', senaryoOlusturModalKapat);
  document.getElementById('senaryoOlusturModalOrtu').addEventListener('click', function (olay) {
    if (olay.target === olay.currentTarget) senaryoOlusturModalKapat();
  });
  // (Olay nesnesi senaryoOlusturModalAc'a "duzenleme" parametresi olarak gitmesin diye sarılır.)
  document.getElementById('senaryoOlusturButonu').addEventListener('click', function () { senaryoOlusturModalAc(null); });

  // "✎ Düzenle" (JetSeyahat dışı) küçük popup'ı.
  document.getElementById('senaryoDuzenleModalKapatButonu').addEventListener('click', senaryoDuzenleBasitModalKapat);
  document.getElementById('senaryoDuzenleModalOrtu').addEventListener('click', function (olay) {
    if (olay.target === olay.currentTarget) senaryoDuzenleBasitModalKapat();
  });

  // Ekran görüntüsü büyütme: sayfadaki (veya başka bir modal içindeki) herhangi bir
  // ".hata-goruntu" küçük resmine tıklanınca resmi ortalanmış/büyük halde gösterir.
  function gorselBuyutmeAc(src, alt) {
    if (!src) return;
    document.getElementById('gorselBuyutmeResim').src = src;
    document.getElementById('gorselBuyutmeResim').alt = alt || 'Büyütülmüş ekran görüntüsü';
    document.getElementById('gorselBuyutmeOrtu').classList.add('acik');
  }
  function gorselBuyutmeKapat() {
    document.getElementById('gorselBuyutmeOrtu').classList.remove('acik');
    document.getElementById('gorselBuyutmeResim').src = '';
  }
  document.addEventListener('click', function (olay) {
    var resim = olay.target.closest('.hata-goruntu');
    if (resim) gorselBuyutmeAc(resim.getAttribute('src'), resim.getAttribute('alt'));
  });
  document.getElementById('gorselBuyutmeKapatButonu').addEventListener('click', gorselBuyutmeKapat);
  document.getElementById('gorselBuyutmeOrtu').addEventListener('click', function (olay) {
    if (olay.target === olay.currentTarget) gorselBuyutmeKapat();
  });

  document.addEventListener('keydown', function (olay) {
    if (olay.key !== 'Escape') return;
    if (document.getElementById('topluKosuOnayOrtu').classList.contains('acik')) topluKosuOnayKapat();
    else if (document.getElementById('gorselBuyutmeOrtu').classList.contains('acik')) gorselBuyutmeKapat();
    else if (document.getElementById('senaryoSonucModalOrtu').classList.contains('acik')) senaryoSonucModalKapat();
    else if (document.getElementById('senaryoCanliPanelOrtu').classList.contains('acik')) senaryoCanliPanelKapat();
    else if (document.getElementById('senaryoOlusturModalOrtu').classList.contains('acik')) senaryoOlusturModalKapat();
    else if (document.getElementById('senaryoDuzenleModalOrtu').classList.contains('acik')) senaryoDuzenleBasitModalKapat();
    else adimDetayModalKapat();
  });
