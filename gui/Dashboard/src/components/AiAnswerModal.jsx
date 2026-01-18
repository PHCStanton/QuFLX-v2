const AiAnswerModal = ({ isOpen, answer, onClose }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-w-3xl w-full mx-4 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
          <span className="text-sm font-semibold text-white">AI Response</span>
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 text-[11px] rounded bg-gray-800 text-gray-300 border border-gray-600 hover:bg-gray-700"
          >
            Close
          </button>
        </div>
        <div className="p-4 max-h-[70vh] overflow-auto">
          <pre className="whitespace-pre-wrap text-sm text-gray-100">{answer || ''}</pre>
        </div>
      </div>
    </div>
  );
};

export default AiAnswerModal;

