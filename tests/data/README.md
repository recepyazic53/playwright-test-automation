# Ortam test verileri

- `test/`: yalnızca TEST ortamı iş verileri
- `canli/`: yalnızca CANLI ortamı iş verileri
- `ortak.json`: giriş sonrası doğrulama ve acente/kullanıcı seçimi
- `jet-kasko.json`, `trafik.json`: ürün ve senaryo verileri

Kullanıcı adı, parola, Authenticator kodu ve API anahtarı bu dosyalara yazılmaz; `.env` kullanılır.

## Koşu listesi (`kosu-listesi.json`)

Ortamdan bağımsız, versiyonlanan tek dosya. `haricTutulanlar` dizisi koşudan **hariç** tutulan senaryoların `"<dosya>::<ad>"` anahtarlarını tutar (dosya `tests/` klasörüne göre göreli, `/` ayraçlı; ör. `scenarios/jet-konut/teklif-matrisi.spec.ts::<başlık>`). Listede olmayan her senaryo — kodla yeni eklenenler dahil — koşuya dahildir.

- `npm run test` / CI koşuları bu listeye uyar (`playwright.config.ts` > `grepInvert`).
- Dashboard'daki "Koşuda" anahtarları ve "Koşuya ekle / Koşudan çıkar" düğmeleri dosyayı `npm run test-sunucu` üzerinden atomik olarak günceller; "▷ Koşuyu başlat" yalnızca dahil senaryoları koşar.
- Hariç tutulan bir senaryo dashboard'da soluk görünür ama ▷ ile tek başına yine çalıştırılabilir.
