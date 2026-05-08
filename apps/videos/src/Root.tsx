import "./style.css";
import type React from "react";
import { Composition } from "remotion";
import { BrandGradient } from "./compositions/ambient/BrandGradient";
import { FloatingTools } from "./compositions/ambient/FloatingTools";
import { AiMagicReel } from "./compositions/features/AiMagicReel";
import { FormatUniverse } from "./compositions/features/FormatUniverse";
import { PipelineFlow } from "./compositions/features/PipelineFlow";
import { OneCommand } from "./compositions/hero/OneCommand";
import { PrivacyPromise } from "./compositions/hero/PrivacyPromise";
import { ToolGalaxy } from "./compositions/hero/ToolGalaxy";
import { ProductDemo } from "./compositions/product-demo/ProductDemo";
import { PromoTeaser } from "./compositions/promo-teaser/PromoTeaser";
import { PromoTeaserVertical } from "./compositions/promo-teaser/PromoTeaserVertical";
import { CloudVsLocal } from "./compositions/showcase/CloudVsLocal";
import { The48 } from "./compositions/showcase/The48";
import { XLaunchVideo } from "./compositions/x-launch/XLaunchVideo";

export const RemotionRoot: React.FC = () => (
  <>
    {/* Ambient */}
    <Composition
      id="FloatingTools"
      component={FloatingTools}
      durationInFrames={120}
      fps={30}
      width={800}
      height={600}
    />
    <Composition
      id="BrandGradient"
      component={BrandGradient}
      durationInFrames={150}
      fps={30}
      width={800}
      height={600}
    />

    {/* Features */}
    <Composition
      id="FormatUniverse"
      component={FormatUniverse}
      durationInFrames={180}
      fps={30}
      width={800}
      height={600}
    />
    <Composition
      id="PipelineFlow"
      component={PipelineFlow}
      durationInFrames={390}
      fps={30}
      width={800}
      height={600}
    />
    <Composition
      id="AiMagicReel"
      component={AiMagicReel}
      durationInFrames={480}
      fps={30}
      width={800}
      height={600}
    />

    {/* Hero */}
    <Composition
      id="PrivacyPromise"
      component={PrivacyPromise}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="OneCommand"
      component={OneCommand}
      durationInFrames={390}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="ToolGalaxy"
      component={ToolGalaxy}
      durationInFrames={660}
      fps={30}
      width={1920}
      height={1080}
    />

    {/* Showcase */}
    <Composition
      id="The48"
      component={The48}
      durationInFrames={600}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="CloudVsLocal"
      component={CloudVsLocal}
      durationInFrames={540}
      fps={30}
      width={1920}
      height={1080}
    />

    {/* Promo / Marketing */}
    <Composition
      id="PromoTeaser"
      component={PromoTeaser}
      durationInFrames={600}
      fps={30}
      width={1080}
      height={1080}
    />
    <Composition
      id="PromoTeaserVertical"
      component={PromoTeaserVertical}
      durationInFrames={600}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="XLaunchVideo"
      component={XLaunchVideo}
      durationInFrames={1050}
      fps={30}
      width={1080}
      height={1080}
    />
    <Composition
      id="ProductDemo"
      component={ProductDemo}
      durationInFrames={2250}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);
