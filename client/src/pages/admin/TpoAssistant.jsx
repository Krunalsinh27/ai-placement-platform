import React from 'react';
import AssistantChat from '../../components/assistant/AssistantChat';

const TpoAssistant = () => {
  return (
    <div className="w-full h-[calc(100dvh-6rem)] sm:h-[calc(100dvh-7rem)] lg:h-[calc(100dvh-8rem)] min-h-0 flex flex-col">
      <AssistantChat />
    </div>
  );
};

export default TpoAssistant;
