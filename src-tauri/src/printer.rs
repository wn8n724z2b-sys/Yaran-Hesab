use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::Local;
use std::{fs, path::PathBuf, process::Command};

fn encode_powershell(script: &str) -> String {
    let mut bytes = Vec::with_capacity(script.len() * 2);
    for unit in script.encode_utf16() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    STANDARD.encode(bytes)
}

fn ps_single_quote(value: &str) -> String {
    value.replace('\'', "''")
}

pub fn list_windows_printers() -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Get-Printer | Sort-Object Name | Select-Object -ExpandProperty Name",
            ])
            .output()
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
        let text = String::from_utf8_lossy(&output.stdout);
        Ok(text
            .lines()
            .map(str::trim)
            .filter(|x| !x.is_empty())
            .map(str::to_string)
            .collect())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(Vec::new())
    }
}

pub fn print_receipt_png(printer_name: &str, png_base64: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if printer_name.trim().is_empty() {
            return Err("نام پرینتر مشخص نشده است".to_string());
        }
        let bytes = STANDARD
            .decode(png_base64.trim())
            .map_err(|e| format!("invalid receipt image: {e}"))?;
        if bytes.is_empty() {
            return Err("تصویر رسید خالی است".to_string());
        }

        let mut path: PathBuf = std::env::temp_dir();
        let stamp = Local::now().format("%Y%m%d_%H%M%S_%3f");
        path.push(format!("hesabdari_asan_receipt_{stamp}.png"));
        fs::write(&path, bytes).map_err(|e| e.to_string())?;

        let printer = ps_single_quote(printer_name);
        let image_path = ps_single_quote(&path.to_string_lossy());
        // Print through the installed Windows driver without opening a print dialog.
        // The receipt is rasterized by WebView first, so Dari/Persian shaping is preserved.
        let script = format!(
            r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('{image_path}')
$pd = New-Object System.Drawing.Printing.PrintDocument
$pd.PrinterSettings.PrinterName = '{printer}'
if (-not $pd.PrinterSettings.IsValid) {{ throw 'Printer not found or unavailable' }}
$pd.PrintController = New-Object System.Drawing.Printing.StandardPrintController
$pd.OriginAtMargins = $false
$pd.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0,0,0,0)
$paperWidth = 315
$paperHeight = [Math]::Max(120, [Math]::Ceiling($img.Height * $paperWidth / $img.Width))
$pd.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('Hesabdari Asan 80mm', $paperWidth, $paperHeight)
$handler = [System.Drawing.Printing.PrintPageEventHandler]{{
  param($sender, $e)
  $w = $e.PageBounds.Width
  $h = [Math]::Ceiling($img.Height * $w / $img.Width)
  $e.Graphics.DrawImage($img, 0, 0, $w, $h)
  $e.HasMorePages = $false
}}
$pd.add_PrintPage($handler)
try {{ $pd.Print() }} finally {{
  $pd.remove_PrintPage($handler)
  $img.Dispose()
  $pd.Dispose()
}}
"#
        );
        let encoded = encode_powershell(&script);
        let output = Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-EncodedCommand", &encoded])
            .output()
            .map_err(|e| e.to_string())?;
        let _ = fs::remove_file(&path);
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let out = String::from_utf8_lossy(&output.stdout).trim().to_string();
            return Err(if !err.is_empty() { err } else { out });
        }
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (printer_name, png_base64);
        Err("Direct receipt printing is available on Windows only".to_string())
    }
}
