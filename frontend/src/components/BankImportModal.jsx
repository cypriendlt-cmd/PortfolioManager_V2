import { useState, useEffect } from 'react'
import { X, Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader } from 'lucide-react'
import { listFilesInAppFolder, loadBinaryFileFromDrive } from '../services/googleDrive'
import { parseSheetName } from '../services/bankParser'
import { useBank } from '../context/BankContext'
import * as XLSX from 'xlsx'

export default function BankImportModal({ open, onClose }) {
  const { importExcel } = useBank()
  const [files, setFiles] = useState([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!open) return
    setLoadingFiles(true)
    setResult(null)
    setSelectedFile(null)
    setPreview(null)
    listFilesInAppFolder('xlsx')
      .then(setFiles)
      .catch(() => setFiles([]))
      .finally(() => setLoadingFiles(false))
  }, [open])

  const handleSelect = async (file) => {
    setSelectedFile(file)
    setResult(null)
    try {
      const buf = await loadBinaryFileFromDrive(file.name)
      const wb = XLSX.read(buf, { type: 'array' })
      const sheets = wb.SheetNames.map(name => ({
        name,
        ...parseSheetName(name),
      }))
      setPreview({ sheets, buffer: buf })
    } catch {
      setPreview({ sheets: [], error: 'Impossible de lire le fichier' })
    }
  }

  const handleImport = async () => {
    if (!preview?.buffer) return
    setImporting(true)
    try {
      const res = await importExcel(preview.buffer)
      setResult(res)
    } catch (e) {
      setResult({ error: e.message })
    } finally {
      setImporting(false)
    }
  }

  const handleLocalFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile({ name: file.name })
    setResult(null)
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheets = wb.SheetNames.map(name => ({ name, ...parseSheetName(name) }))
    setPreview({ sheets, buffer: buf })
  }

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h3><FileSpreadsheet size={18} /> Import relevé bancaire</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ padding: '16px 20px' }}>
          {/* Local file upload */}
          <label className="bank-upload-area" style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
            border: '2px dashed var(--border)', borderRadius: 10, cursor: 'pointer',
            marginBottom: 16, background: 'var(--bg-secondary)'
          }}>
            <Upload size={18} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '0.85rem' }}>Ou sélectionner un fichier .xlsx local</span>
            <input type="file" accept=".xlsx,.xls" onChange={handleLocalFile} style={{ display: 'none' }} />
          </label>

          {/* Drive files */}
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>
            Fichiers .xlsx dans Google Drive :
          </div>
          {loadingFiles ? (
            <div style={{ textAlign: 'center', padding: 20 }}><Loader size={20} className="spin" /></div>
          ) : files.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Aucun fichier .xlsx trouvé dans le dossier PortfolioManager_V2</p>
          ) : (
            <div style={{ maxHeight: 150, overflow: 'auto', marginBottom: 12 }}>
              {files.map(f => (
                <div key={f.id} onClick={() => handleSelect(f)} style={{
                  padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem',
                  background: selectedFile?.name === f.name ? 'var(--accent-light)' : 'transparent',
                  marginBottom: 4,
                }}>
                  <FileSpreadsheet size={14} style={{ marginRight: 6 }} />
                  {f.name}
                </div>
              ))}
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-primary)', borderRadius: 10, fontSize: '0.82rem' }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Feuilles détectées :</div>
              {preview.error && <p style={{ color: 'var(--danger)' }}>{preview.error}</p>}
              {preview.sheets.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  {s.valid ? (
                    <CheckCircle size={14} style={{ color: 'var(--success)' }} />
                  ) : (
                    <AlertCircle size={14} style={{ color: 'var(--warning)' }} />
                  )}
                  <span>{s.name}</span>
                  {s.valid && <span style={{ color: 'var(--text-muted)' }}>→ {s.type} / {s.alias}</span>}
                  {!s.valid && <span style={{ color: 'var(--warning)', fontSize: '0.75rem' }}>{s.error}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Result */}
          {result && (
            <div style={{
              marginTop: 12, padding: 12, borderRadius: 10,
              background: result.error ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
              fontSize: '0.82rem'
            }}>
              {result.error ? (
                <p style={{ color: 'var(--danger)' }}>Erreur : {result.error}</p>
              ) : (
                <>
                  <p><strong>{result.newCount}</strong> nouvelles transactions importées</p>
                  <p><strong>{result.dupCount}</strong> doublons ignorés</p>
                  <p><strong>{result.accountCount}</strong> compte(s) détecté(s)</p>
                  {result.errors?.length > 0 && result.errors.map((e, i) => (
                    <p key={i} style={{ color: 'var(--warning)', marginTop: 4 }}>{e}</p>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
          <button
            className="btn btn-primary"
            disabled={!preview?.buffer || importing}
            onClick={handleImport}
          >
            {importing ? <><Loader size={14} className="spin" /> Import...</> : 'Importer'}
          </button>
        </div>
      </div>
    </div>
  )
}
