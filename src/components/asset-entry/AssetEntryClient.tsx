"use client";

import React from "react";
import AssetEntryInlineForm from "@/components/asset-entry/AssetEntryInlineForm";
import MyTodaySubmissions from "@/components/asset-entry/MyTodaySubmissions";

const AssetEntryClient: React.FC = () => {
  return (
    <div className="w-full">
      <AssetEntryInlineForm />
      <div className="mx-auto max-w-4xl p-4 pt-0">
        <MyTodaySubmissions />
      </div>
    </div>
  );
};

export default AssetEntryClient;