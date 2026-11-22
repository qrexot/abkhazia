"use strict";
// ============================================================================
// ОДНОРАЗОВАЯ НАСТРОЙКА SUPABASE ДЛЯ GITHUB PAGES
// Используется ТОЛЬКО публичный publishable-ключ (безопасен для браузера и GitHub Pages,
// вся защита и античит работают на сервере через RLS + SECURITY DEFINER RPC).
// Секретные ключи (sb_secret / JWT Secret) в клиентский код НЕ добавляются!
// ============================================================================
window.ABKHAZIA_SUPABASE_CONFIG = {
  url: 'https://xszxomluanldmjdnoisp.supabase.co',
  anonKey: 'sb_publishable__P1phfQH9rUXGIzjz8X69A_QWsd94Wx'
};
