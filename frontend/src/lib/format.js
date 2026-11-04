export const rupiah = (n) =>
  n == null ? "-" : "Rp" + Number(n).toLocaleString("id-ID", { maximumFractionDigits: 0 });

export const dt = (iso) =>
  iso ? new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

export const STATUS_META = {
  CREATED: { label: "Dibuat", tone: "slate" },
  PENDING: { label: "Menunggu Pembayaran", tone: "blue" },
  PAYMENT_DETECTED: { label: "Pembayaran Terdeteksi", tone: "sky" },
  AWAITING_VERIFICATION: { label: "Menunggu Verifikasi", tone: "amber" },
  PAID_VERIFIED: { label: "Terverifikasi", tone: "green" },
  REVIEW_REQUIRED: { label: "Perlu Ditinjau", tone: "orange" },
  FAILED: { label: "Gagal", tone: "red" },
  EXPIRED: { label: "Kedaluwarsa", tone: "slate" },
  CANCELLED: { label: "Dibatalkan", tone: "slate" },
  REFUNDED: { label: "Dikembalikan", tone: "slate" },
  ACTIVE: { label: "Aktif", tone: "green" },
  PENDING_REVIEW: { label: "Menunggu Review", tone: "amber" },
  SUSPENDED: { label: "Ditangguhkan", tone: "red" },
  DISABLED: { label: "Nonaktif", tone: "slate" },
  REJECTED: { label: "Ditolak", tone: "red" },
  DELIVERED: { label: "Terkirim", tone: "green" },
  DELIVERING: { label: "Mengirim", tone: "sky" },
  DEAD_LETTER: { label: "Dead Letter", tone: "red" },
  MATCHED: { label: "Cocok", tone: "green" },
  UNMATCHED: { label: "Tidak Cocok", tone: "orange" },
  RECONCILED: { label: "Direkonsiliasi", tone: "green" },
  RECEIVED: { label: "Diterima", tone: "blue" },
  OPEN: { label: "Terbuka", tone: "blue" },
  IN_PROGRESS: { label: "Diproses", tone: "amber" },
  RESOLVED: { label: "Selesai", tone: "green" },
  CLOSED: { label: "Ditutup", tone: "slate" },
};

export const ROLE_LABEL = {
  MERCHANT_OWNER: "Pemilik",
  MERCHANT_ADMIN: "Admin",
  MERCHANT_DEVELOPER: "Developer",
  MERCHANT_VIEWER: "Viewer",
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin Platform",
};

export const PERMS = {
  MERCHANT_OWNER: ["invoices:read", "invoices:write", "qris:manage", "developers:manage", "team:manage", "settings:manage"],
  MERCHANT_ADMIN: ["invoices:read", "invoices:write", "qris:manage", "developers:manage", "team:manage", "settings:manage"],
  MERCHANT_DEVELOPER: ["invoices:read", "invoices:write", "developers:manage"],
  MERCHANT_VIEWER: ["invoices:read"],
};
