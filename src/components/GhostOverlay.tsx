import { motion, AnimatePresence } from 'framer-motion';

export const GhostOverlay = ({ currentCode, isVisible }: { currentCode: string, isVisible: boolean }) => {
    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, x: 20 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
                    transition={{ type: "spring", stiffness: 100 }}
                    className="absolute top-8 right-8 max-w-md pointer-events-none z-20"
                >
                    {/* Holographic Container */}
                    <div className="relative bg-black/60 backdrop-blur-sm border border-cyan-400/30 p-4 rounded-lg shadow-[0_0_30px_rgba(34,211,238,0.2)] overflow-hidden">

                        {/* Decorative Corners */}
                        <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-cyan-400"></div>
                        <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-cyan-400"></div>
                        <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-cyan-400"></div>
                        <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-cyan-400"></div>

                        {/* Scanner Line Animation */}
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-400/10 to-transparent w-full h-[10px] animate-scan-y pointer-events-none" />

                        {/* Header Label */}
                        <div className="flex items-center gap-2 mb-2 border-b border-cyan-500/20 pb-1">
                            <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse"></div>
                            <span className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold">Jarvis Code Analysis</span>
                        </div>

                        {/* Code Content */}
                        <motion.pre
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.2, duration: 0.5 }}
                            className="text-cyan-200 font-mono text-xs whitespace-pre-wrap leading-relaxed drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]"
                        >
                            <code>{currentCode}</code>
                        </motion.pre>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
