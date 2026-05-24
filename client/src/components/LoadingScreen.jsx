export default function LoadingScreen({ message = 'loading', words }) {
  const defaultWords = ['employees', 'projects', 'attendance', 'reports', 'employees'];

  return (
    <div className="loading-overlay">
      <div className="loading-root">
        <div className="loader">
          <p>{message}</p>
          <div className="words">
            <span className="word">{words?.[0] || defaultWords[0]}</span>
            <span className="word">{words?.[1] || defaultWords[1]}</span>
            <span className="word">{words?.[2] || defaultWords[2]}</span>
            <span className="word">{words?.[3] || defaultWords[3]}</span>
            <span className="word">{words?.[4] || defaultWords[4]}</span>
          </div>
          <div className="shimmer-sweep" />
        </div>
      </div>
    </div>
  );
}
