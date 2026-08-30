import React, { useState } from 'react';
import { ShieldCheck, ExternalLink, AlertTriangle, RefreshCw } from 'lucide-react';

interface PrivacyModalProps {
  isOpen: boolean;
  onAccept: () => void;
}

export const PrivacyModal: React.FC<PrivacyModalProps> = ({
  isOpen,
  onAccept
}) => {
  const [hasDeclined, setHasDeclined] = useState(false);
  const privacyUrl = 'https://agreement-drcn.hispace.dbankcloud.cn/index.html?lang=zh&agreementId=2028614000513680192';

  if (!isOpen) return null;

  const handleDecline = () => {
    setHasDeclined(true);
  };

  const handleReconsider = () => {
    setHasDeclined(false);
  };

  return (
    <div
      id="privacy-policy-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 select-none"
    >
      <div
        id="privacy-policy-modal-card"
        className="w-full max-w-md bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl p-5 space-y-4 text-left overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {!hasDeclined ? (
          <>
            {/* Header */}
            <div className="flex items-center space-x-2.5 pb-2 border-b border-[var(--border-subtle)]">
              <div className="p-2 rounded-lg bg-[var(--brand-subtle)] text-[var(--brand)]">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[var(--text-primary)]">用户隐私政策提示</h2>
                <p className="text-[11px] text-[var(--text-secondary)]">使用前请仔细阅读并确认</p>
              </div>
            </div>

            {/* Content Body */}
            <div className="text-xs text-[var(--text-secondary)] leading-relaxed space-y-2.5 max-h-[48vh] overflow-y-auto pr-1">
              <p>
                欢迎使用本开发与代码运行工具。为了保障您的合法权益，请在继续使用前仔细阅读并了解我们的
                <a
                  href={privacyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--brand)] underline underline-offset-2 mx-1 font-medium inline-flex items-center space-x-0.5 hover:opacity-80"
                >
                  <span>《隐私政策》</span>
                  <ExternalLink className="w-3 h-3 inline ml-0.5" />
                </a>
                内容。
              </p>

              <div className="p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] space-y-1.5 text-[11px]">
                <div className="font-semibold text-[var(--text-primary)]">主要说明摘要：</div>
                <ul className="list-disc list-inside space-y-1 text-[var(--text-secondary)]">
                  <li>本应用代码沙箱执行与项目文件均存储于您的本地浏览器中。</li>
                  <li>未经您的明确许可，不会将您的个人隐私数据或代码上传至第三方服务器。</li>
                  <li>如需查看完整条款及各项服务权责，请点击上方链接进行查阅。</li>
                </ul>
              </div>

              <p className="text-[11px] text-[var(--text-tertiary)]">
                若您点击“同意”，即表示您已阅读并完全同意上述隐私政策全部内容；如您不同意，可选择“不同意并退出”。
              </p>
            </div>

            {/* Footer Buttons */}
            <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center space-x-3">
              <button
                id="btn-privacy-decline"
                onClick={handleDecline}
                className="flex-1 py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] text-xs font-medium press-feedback text-center transition-colors"
              >
                不同意并退出
              </button>

              <button
                id="btn-privacy-agree"
                onClick={onAccept}
                className="flex-1 py-2.5 rounded-lg bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-xs font-medium press-feedback shadow-sm text-center transition-colors"
              >
                同意
              </button>
            </div>
          </>
        ) : (
          /* Declined View */
          <div className="space-y-4 py-2">
            <div className="flex items-center space-x-2.5 text-[var(--warning)]">
              <div className="p-2 rounded-lg bg-[var(--warning-subtle)]">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">已拒绝隐私政策</h3>
                <p className="text-[11px] text-[var(--text-secondary)]">应用无法继续提供服务</p>
              </div>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed bg-[var(--bg-tertiary)] p-3 rounded-lg border border-[var(--border-subtle)]">
              由于您未同意《隐私政策》，本应用无法为您加载代码编辑与运行环境。您可以直接关闭当前网页，或者重新阅读并同意政策以恢复使用。
            </p>

            <div className="flex items-center space-x-3 pt-2 border-t border-[var(--border-subtle)]">
              <button
                id="btn-privacy-reconsider"
                onClick={handleReconsider}
                className="flex-1 py-2.5 rounded-lg bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-xs font-medium press-feedback flex items-center justify-center space-x-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>重新查看政策</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
