// Corre Gradle del proyecto Android con el JDK de Android Studio (Capacitor 7 pide JDK 21).
// Uso: node scripts/android-gradle.mjs assembleDebug
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const env = { ...process.env };
const jbr = 'C:\Program Files\Android\Android Studio\jbr';
if (existsSync(jbr)) env.JAVA_HOME = jbr;
env.ANDROID_HOME ||= path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
const win = process.platform === 'win32';
const gradlew = path.resolve('android', win ? 'gradlew.bat' : 'gradlew');
execSync(`"${gradlew}" ${process.argv.slice(2).join(' ')}`, { cwd: path.resolve('android'), env, stdio: 'inherit' });
