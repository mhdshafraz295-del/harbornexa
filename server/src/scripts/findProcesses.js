const { execSync } = require('child_process');

try {
  const psScript = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('harbornexa') } | Select-Object ProcessId, ParentProcessId, Name, CommandLine | ConvertTo-Json`;
  const output = execSync(`powershell -Command "${psScript}"`).toString();
  console.log('=== HARBORNEXA PROCESSES ===');
  console.log(output || 'NONE');
} catch (err) {
  console.log('=== HARBORNEXA PROCESSES ===');
  console.log('NONE');
}
