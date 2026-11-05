// Lesson data. Worked figures are approximations, not engine measurements.
export default {
  "id": "privacy-design",
  "title": "Privacy by design",
  "track": "Go deeper",
  "minutes": 7,
  "summary": "The safest data to protect is data the service never receives.",
  "steps": [
    {
      "kind": "read",
      "title": "A wearable knows more than the dashboard needs",
      "text": "A wrist device samples motion every second. The person wants a daily activity summary, not a server-side copy of every movement. Uploading all raw readings creates a sensitive archive and an ongoing deletion obligation. Start by asking which feature needs which data, who can read it and how long it must exist.",
      "icon": "el.kms"
    },
    {
      "kind": "read",
      "title": "Move the boundary deliberately",
      "text": "Data minimisation means collecting the fields, precision and retention needed for a stated purpose. On-device processing can keep raw health or location data local and upload only chosen summaries. It uses device CPU and needs a reliable local store. End-to-end encryption means only authorized endpoints hold decryption keys; TLS and encryption at rest do not provide that boundary if the service holds the keys. A server without plaintext cannot offer ordinary full-text search, content moderation or account recovery from a password reset alone. Local search and explicit encrypted backup or recovery keys change the product. Timing, account ids and sizes can still leak metadata."
    },
    {
      "kind": "read",
      "title": "Worked example: sparse uploads",
      "text": "Assume one 16-byte reading each second. That is about 1.38 MB/day per device before local indexes. Thirty days require about 41.5 MB. A 2 KB daily summary is about 690 times less payload than raw readings. The summary can still reveal health information and needs consent, authorization and retention rules. These are decimal payload calculations, not a radio-energy measurement. The sim cannot prove device isolation, encryption or legal compliance; a passing traffic day does not establish those properties."
    },
    {
      "kind": "numbers",
      "rows": [
        {
          "label": "Raw payload",
          "value": "≈ 1.38 MB/day",
          "how": "16 B × 86,400 samples"
        },
        {
          "label": "Thirty days local",
          "value": "≈ 41.5 MB",
          "how": "Before indexes, encryption overhead and spare capacity"
        },
        {
          "label": "Summary payload",
          "value": "≈ 2 KB/day",
          "how": "About 690 times less payload, still sensitive"
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "The service itself decrypts uploaded notes to build an ordinary search index. Which privacy claim is accurate?",
      "choices": [
        "Content is encrypted in transit and storage, but readable by the service",
        "Content is end-to-end encrypted because only the indexing worker has the key",
        "Content is hidden from the service if the worker discards plaintext after indexing"
      ],
      "answer": 0,
      "why": "Temporary or restricted server access is still plaintext access within the service trust boundary."
    },
    {
      "kind": "defend",
      "q": "Can we keep server search and claim the service cannot read notes? Follow-up: what does the first version offer?",
      "checklist": [
        "Keep note keys and plaintext search indexes on authorized devices",
        "Name timing and size leakage and the loss of ordinary server search",
        "Describe authenticated enrollment and a user-held recovery secret"
      ],
      "model": "Ordinary server plaintext indexing contradicts that claim. In the first version, devices encrypt notes with a random collection key and search a local plaintext index. An existing authorized device authenticates enrollment and wraps the collection key for the new device. A user-held recovery secret can unwrap a separately stored encrypted key backup; the server never receives that secret. Losing every device and the recovery secret means losing access. Timing and sizes still leak metadata. If server plaintext processing is required, I would change the trust claim explicitly."
    },
    {
      "kind": "read",
      "title": "Keys and deletion are workflows",
      "text": "Use authenticated encryption, unique nonces under a key and well-reviewed libraries. Wrap per-user or per-collection data keys with keys kept in the device's protected key store. Authenticate new devices, provide revocation and explain recovery before a device is lost. Routine wrapping-key rotation can rewrap data keys. If a wrapping key was compromised, an attacker may already have unwrapped data keys, so rewrapping alone cannot restore confidentiality. Rotate affected data keys and re-encrypt future content as needed; already copied plaintext cannot be recalled. Revocation cannot erase plaintext already copied by an old device. Deletion covers active rows, object versions, indexes, caches, exports and backups. Track a deletion job through each store and prove completion with a receipt and a restore test. Backup expiry may bound final deletion. Cryptographic erasure works only if every usable copy of the relevant key is gone. Be precise about evidence and residual limits instead of promising an impossible universal proof."
    },
    {
      "kind": "quiz",
      "q": "Every authorized device is lost. The service holds no content recovery secret. What could still restore encrypted notes?",
      "choices": [
        "A password reset plus a fresh device-generated content key",
        "A recovery secret the user saved before the loss",
        "Rewrapping the stored ciphertext with a new server metadata key"
      ],
      "answer": 1,
      "why": "A new key cannot decrypt old ciphertext. Recovery needs an existing content key or a secret that can unwrap it."
    },
    {
      "kind": "defend",
      "q": "The customer asks for proof of deletion. What can we actually prove? Follow-up: a backup is restored next week.",
      "checklist": [
        "Inventory object versions, indexes, backups and usable key copies",
        "State per-store deletion evidence and backup expiry deadlines",
        "Reapply the deletion ledger before a restored backup serves requests"
      ],
      "model": "I can provide evidence that our managed stores processed a deletion, with per-store receipts, object-version checks and key-lifecycle records. I cannot prove an endpoint never copied plaintext. Restores must reapply a deletion ledger before serving data, or the backup must already be unreadable through complete key erasure. I would state when backups expire and test a restore against that promise. Keeping the evidence minimal avoids creating a new archive of the deleted content."
    },
    {
      "kind": "quiz",
      "q": "Active rows are deleted, but retained backups still contain decryptable copies. Which receipt is accurate?",
      "choices": [
        "Deletion is complete because backups are not part of the live service",
        "Deletion is complete once the current wrapping key is rotated",
        "Active deletion is verified; backup expiry and restore suppression remain tracked"
      ],
      "answer": 2,
      "why": "Retained keys may still decrypt backups after rotation. Receipts must state the remaining backup boundary and deadline."
    }
  ],
  "takeaway": "Choose what leaves the device, who holds keys and how deletion finishes before collecting data."
};
