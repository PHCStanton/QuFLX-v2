import { useState, useRef, useEffect } from 'react';
import { X, Upload, Check, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import useUserStore from '../store/userStore';

const ProfilePicEditorModal = ({ isOpen, onClose }) => {
    const { updateUser } = useUserStore();
    const [image, setImage] = useState(null);
    const [scale, setScale] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const fileInputRef = useRef(null);
    const imgRef = useRef(null);

    useEffect(() => {
        if (!isOpen) {
            setImage(null);
            setScale(1);
            setOffset({ x: 0, y: 0 });
            setRotation(0);
        }
    }, [isOpen]);

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('Please select an image file.');
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                setImage(reader.result);
                imgRef.current = img;
                // Reset state on new image
                setScale(1);
                setOffset({ x: 0, y: 0 });
                setRotation(0);
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    };

    const handleMouseDown = (e) => {
        if (!image) return;
        setIsDragging(true);
        setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    };

    const handleMouseMove = (e) => {
        if (!isDragging) return;
        setOffset({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleSave = () => {
        const canvas = document.createElement('canvas');
        const size = 300; // Output size
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        if (!ctx || !imgRef.current) return;

        // Create circular clip
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.clip();

        // Draw image with transformation
        const img = imgRef.current;
        const drawWidth = img.width * scale;
        const drawHeight = img.height * scale;

        ctx.translate(size / 2 + offset.x, size / 2 + offset.y);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);

        const dataUrl = canvas.toDataURL('image/png');
        updateUser({ avatar: dataUrl });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-[#0f1419] border border-gray-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
                    <h2 className="text-lg font-bold text-white tracking-tight">Update Profile Picture</h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors text-gray-400">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-8">
                    <div
                        className="relative w-64 h-64 mx-auto rounded-full border-2 border-dashed border-gray-700 overflow-hidden bg-black/40 cursor-move group"
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                    >
                        {image ? (
                            <div
                                className="w-full h-full flex items-center justify-center transition-transform duration-75 select-none pointer-events-none"
                                style={{
                                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg)`
                                }}
                            >
                                <img src={image} alt="Crop preview" className="max-w-none max-h-none" style={{ userSelect: 'none' }} />
                            </div>
                        ) : (
                            <div
                                className="w-full h-full flex flex-col items-center justify-center gap-3 text-gray-500 hover:text-purple-400 cursor-pointer transition-colors"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <div className="p-4 rounded-full bg-white/5 border border-gray-800 group-hover:bg-purple-500/10 group-hover:border-purple-500/50 transition-all">
                                    <Upload size={32} />
                                </div>
                                <span className="text-xs font-medium uppercase tracking-widest">Select Image</span>
                            </div>
                        )}

                        {image && (
                            <div className="absolute inset-0 pointer-events-none ring-[100px] ring-black/60 rounded-full border border-purple-500/30" />
                        )}
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={handleFileChange}
                    />

                    {image && (
                        <div className="mt-8 space-y-6">
                            <div className="flex items-center gap-4">
                                <ZoomOut size={16} className="text-gray-500" />
                                <input
                                    type="range"
                                    min="0.1"
                                    max="3"
                                    step="0.01"
                                    value={scale}
                                    onChange={(e) => setScale(parseFloat(e.target.value))}
                                    className="flex-1 h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                />
                                <ZoomIn size={16} className="text-gray-500" />
                            </div>

                            <div className="flex justify-center gap-4 text-gray-400 text-[11px] font-bold uppercase tracking-wider">
                                <button
                                    onClick={() => setRotation(r => (r + 90) % 360)}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-gray-800 hover:bg-white/10 transition-colors"
                                >
                                    <RotateCw size={14} /> 90°
                                </button>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-gray-800 hover:bg-white/10 transition-colors"
                                >
                                    <Upload size={14} /> Change
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 bg-white/[0.02] border-t border-gray-800 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 rounded-2xl border border-gray-800 text-gray-400 font-semibold text-sm hover:bg-white/5 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!image}
                        className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        <Check size={18} /> Save Photo
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProfilePicEditorModal;
