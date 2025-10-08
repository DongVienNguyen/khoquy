Chức năng: "Tích hợp AI Camera" trên trang "AssetEntry"
1. Tổng quan & Mục tiêu
Chức năng "Tích hợp AI Camera" nhằm tự động hóa việc nhập mã tài sản vào form "AssetEntry" bằng cách sử dụng công nghệ nhận dạng ký tự quang học (OCR) và phân tích chuỗi ký tự từ hình ảnh. Điều này giúp tăng tốc độ nhập liệu, giảm thiểu lỗi chính tả và nâng cao trải nghiệm người dùng, đặc biệt là khi làm việc với nhiều tài sản.
•	Mục tiêu chính:
•	Cho phép người dùng tải lên hình ảnh hoặc chụp ảnh trực tiếp.
•	Sử dụng AI (OCR) để trích xuất văn bản từ hình ảnh.
•	Phân tích văn bản đã trích xuất để tìm kiếm và định dạng mã tài sản (asset_code.asset_year) và xác định phòng ban (room).
•	Tự động điền các trường multipleAssets và room vào form chính.
•	Cung cấp phản hồi trực quan (AI status) về quá trình xử lý cho người dùng.
2. Luồng thực hiện (User Flow)
1.	Người dùng click nút Camera: Trên form "AssetEntry", người dùng click vào nút có biểu tượng Camera (bên cạnh label "Nhập [Mã TS] . [Năm TS]").
2.	Mở Dialog lựa chọn: Một dialog (Shadcn/ui Dialog) hiện ra với hai lựa chọn:
•	"Upload từ thiết bị": Cho phép chọn ảnh từ thư viện hoặc file hệ thống.
•	"Chụp ảnh": Kích hoạt camera để chụp ảnh trực tiếp.
3.	Người dùng chọn/chụp ảnh:
•	Nếu chọn "Upload", một file picker mở ra.
•	Nếu chọn "Chụp ảnh", camera thiết bị mở ra.
•	Người dùng có thể chọn/chụp một hoặc nhiều hình ảnh.
4.	Bắt đầu xử lý & Feedback AI:
•	Dialog vẫn hiển thị. Trạng thái AI (aiStatus) và thanh tiến trình bắt đầu cập nhật.
•	Nút trong dialog chuyển thành "Đang xử lý..." và bị disabled.
•	aiStatus hiển thị các giai đoạn: "Đang chuẩn bị...", "Đang tải ảnh...", "Đang đọc mã từ ảnh...", "Đã xử lý X/Y ảnh", v.v.
5.	Xử lý hình ảnh (Server-side AI/Integration):
•	Mỗi hình ảnh được tải lên hệ thống qua tích hợp UploadFile.
•	Sau khi tải lên, URL của hình ảnh được gửi tới tích hợp ExtractDataFromUploadedFile để trích xuất văn bản.
•	Văn bản trả về được phân tích để tìm mã tài sản và phòng ban.
6.	Cập nhật form & Kết thúc:
•	Sau khi tất cả hình ảnh được xử lý, dialog đóng lại.
•	Các mã tài sản được tìm thấy sẽ tự động điền vào các trường multipleAssets của form chính.
•	Nếu phát hiện phòng ban từ mã, trường room trên form cũng được cập nhật.
•	Hiển thị thông báo message (success/error) về kết quả xử lý.
3. Thiết kế Database (Entities) liên quan
Chức năng này không trực tiếp ghi/đọc vào database mà chỉ hỗ trợ nhập liệu cho entity AssetTransaction thông qua việc điền vào form AssetEntry.
4. Thiết kế UI/Components và Logic chi tiết
4.1. Nút "AI Camera" trên form AssetEntry
•	Vị trí: Bên cạnh Label cho phần nhập mã tài sản.
•	Thành phần: <Button>
•	type="button"
•	variant="ghost"
•	size="icon"
•	className="text-green-600 hover:text-green-700"
•	Icon: Camera (Lucide React)
•	Text: <span>AI</span>
•	Logic:
•	Bọc trong DialogTrigger để mở isImageDialogOpen.
4.2. Dialog "Chọn cách nhập hình ảnh"
•	Thành phần: Dialog (Shadcn/ui) với state.isImageDialogOpen.
•	Header: DialogTitle "Chọn cách nhập hình ảnh".
•	Nội dung:
•	Nút "Upload từ thiết bị": <Button>
•	onClick: Kích hoạt file-input ẩn (document.getElementById('file-input').click()).
•	className="w-full ... bg-blue-500 ..."
•	Icon: Upload (Lucide React)
•	Disabled khi isProcessingImage là true.
•	Nút "Chụp ảnh": <Button>
•	onClick: Kích hoạt camera-input ẩn (document.getElementById('camera-input').click()).
•	className="w-full ... bg-green-500 ..."
•	Icon: Camera (Lucide React)
•	Disabled khi isProcessingImage là true.
•	Phản hồi AI (aiStatus):
•	Hiển thị Loader2 (icon quay) khi isProcessingImage là true hoặc aiStatus.stage có giá trị.
•	Text hiển thị aiStatus.detail.
•	Thanh tiến trình (div với width động theo aiStatus.progress / aiStatus.total) hiển thị các giai đoạn xử lý.
4.3. Inputs type="file" ẩn
•	Hai <input type="file"> ẩn ngoài Dialog để kích hoạt bởi các nút:
•	id="file-input": accept="image/*", multiple (cho phép chọn nhiều ảnh).
•	id="camera-input": accept="image/*", capture="environment" (ưu tiên camera sau trên di động), multiple.
•	Logic: onChange của cả hai input đều gọi hàm handleFileUpload.
4.4. State liên quan (AssetEntry component)
•	isImageDialogOpen: boolean (mở/đóng dialog lựa chọn AI Camera).
•	isProcessingImage: boolean (cho biết đang trong quá trình xử lý ảnh).
•	aiStatus: { stage: string, progress: number, total: number, detail: string } (lưu trữ trạng thái xử lý AI để hiển thị feedback).
4.5. Hàm handleFileUpload
•	Mục đích: Xử lý file ảnh được chọn/chụp.
•	Tham số: event (từ onChange của input file).
•	Logic:
1.	Lấy danh sách files từ event.target.files.
2.	Nếu có file, gọi processImages(files).
3.	Reset giá trị của input file (event.target.value = '') để cho phép chọn lại cùng một file nếu cần.
4.6. Hàm processImages(files) (Logic cốt lõi)
Đây là hàm thực hiện toàn bộ luồng xử lý hình ảnh và tích hợp AI.
•	Mục tiêu: Tải ảnh lên, trích xuất văn bản, phân tích mã tài sản/phòng ban và cập nhật form.
•	Tham số: files (một mảng các đối tượng File).
•	Logic:
1.	Khởi tạo:
•	setIsProcessingImage(true).
•	setAiStatus({ stage: "starting", progress: 0, total: files.length, detail: "Đang chuẩn bị xử lý hình ảnh..." }).
•	setMessage({ type: "", text: "" }) (xóa thông báo cũ).
•	allCodes = [] (mảng lưu tất cả mã tài sản tìm được).
•	detectedRoom = "" (lưu phòng ban được phát hiện).
2.	Vòng lặp qua từng file ảnh (for...of):
•	Cập nhật aiStatus.stage và aiStatus.detail ("Đang tải ảnh...", "Đang đọc mã từ ảnh...").
•	Tải ảnh lên: Sử dụng tích hợp UploadFile.
•	import { UploadFile } from "@/integrations/Core";
•	const { file_url } = await UploadFile({ file });
•	file_url là URL công khai của ảnh đã tải lên.
•	Trích xuất văn bản: Sử dụng tích hợp ExtractDataFromUploadedFile.
•	import { ExtractDataFromUploadedFile } from "@/integrations/Core";
•	const result = await ExtractDataFromUploadedFile({
•	    file_url,
•	    json_schema: { type: "object", properties: { text_content: { type: "string" } } }
•	});
•	json_schema yêu cầu AI trả về một object có trường text_content là string (chứa toàn bộ văn bản trích xuất được).
•	Phân tích văn bản (result.output?.text_content):
•	Sử dụng Regular Expression để tìm các chuỗi có định dạng 0424xxxx hoặc 0423xxxx (ví dụ: /(0424\d+|0423\d+)/g). Đây là các mã định danh nội bộ có chứa thông tin tài sản và phòng ban.
•	Logic phân tích chuỗi:
•	Với mỗi match tìm được:
•	Kiểm tra match.length >= 10 để đảm bảo đủ độ dài.
•	Trích xuất prefix7 (7 ký tự đầu) và prefix6 (6 ký tự đầu).
•	Xác định room (Phòng ban):
•	0424201 => CMT8
•	0424202 => NS
•	0424203 => ĐS
•	0424204 => LĐH
•	042300 => DVKH
•	042410 => QLN
•	Nếu room được phát hiện và detectedRoom chưa có hoặc trùng khớp, cập nhật detectedRoom. Nếu không khớp, có thể bỏ qua để tránh nhầm lẫn hoặc chọn phòng ban xuất hiện nhiều nhất nếu cần (hiện tại logic là phòng ban đầu tiên có mã hợp lệ và khớp).
•	Trích xuất asset_code và asset_year:
•	year: match.slice(-10, -8) (2 ký tự, ví dụ 24 từ ...2470200259).
•	code: parseInt(match.slice(-4), 10) (4 ký tự cuối, ví dụ 259 từ ...0259).
•	formatted: ${code}.${year} (ví dụ: 259.24).
•	Kiểm tra validateAssetFormat(formatted) (định dạng ###.##) và nếu hợp lệ, thêm vào allCodes.
•	Cập nhật aiStatus.progress và aiStatus.detail ("Đã xử lý X/Y ảnh").
3.	Kết quả sau vòng lặp:
•	Không tìm thấy mã: Nếu allCodes.length === 0, hiển thị lỗi "Không tìm thấy mã tài sản hợp lệ." và kết thúc.
•	Tìm thấy mã:
•	Lọc uniqueCodes = [...new Set(allCodes)] để tránh trùng lặp.
•	Nếu detectedRoom có giá trị, gọi handleRoomChange(detectedRoom) để cập nhật trường room trên form.
•	Cập nhật multipleAssets (setMultipleAssets) với uniqueCodes đã tìm thấy.
•	Đóng dialog (setIsImageDialogOpen(false)).
•	Cập nhật aiStatus thành "done" và hiển thị thông báo thành công.
4.	Xử lý lỗi (try...catch): Bắt các lỗi xảy ra trong quá trình tải/trích xuất và hiển thị message lỗi.
5.	Kết thúc (finally): setIsProcessingImage(false), xóa trạng thái aiStatus sau một thời gian ngắn.
4.7. Các hàm Utility liên quan (từ AssetEntry)
•	validateAssetFormat(value): return /^\d{1,4}\.\d{2}$/.test(value.trim()).
•	parseAssetCode(value): Trích xuất asset_code và asset_year từ chuỗi X.YY.
•	handleRoomChange(selectedRoom): Cập nhật formData.room và formData.parts_day, formData.note tương ứng.
5. Chuyển đổi sang cách xử lý dành cho API ChatGPT
Khi hướng dẫn ChatGPT, ta cần cung cấp một luồng rõ ràng, bao gồm các bước cần thực hiện, các API cần gọi, và cách xử lý dữ liệu trả về.
5.1. Mô tả yêu cầu cho ChatGPT
"Tôi cần một chức năng 'Tích hợp AI Camera' trên trang React của mình. Chức năng này sẽ cho phép người dùng tải lên hình ảnh hoặc chụp ảnh, sau đó sử dụng các tích hợp AI để đọc văn bản từ ảnh, phân tích văn bản đó để tìm mã tài sản và xác định phòng ban, rồi tự động điền vào form."
5.2. Các bước ChatGPT cần thực hiện
1.	Thiết kế UI cho nút "AI Camera" và Dialog:
•	Tạo nút Camera (Lucide React) với text "AI" trên form AssetEntry.
•	Tạo một Dialog Shadcn/ui (isImageDialogOpen state) mở ra khi nhấn nút.
•	Trong dialog, tạo 2 Button: "Upload từ thiết bị" và "Chụp ảnh".
•	Bên ngoài dialog, tạo 2 input type="file" ẩn (id="file-input", id="camera-input").
•	Thêm aiStatus feedback (icon Loader2 quay, detail text, progress bar) vào dialog.
2.	Viết hàm handleFileUpload(event):
•	Lấy files từ event.target.files.
•	Gọi processImages(files).
•	Reset event.target.value.
3.	Viết hàm processImages(files):
•	Khởi tạo State:
•	setIsProcessingImage(true).
•	setAiStatus({ stage: "starting", progress: 0, total: files.length, detail: "Đang chuẩn bị xử lý hình ảnh..." }).
•	setMessage({ type: "", text: "" }).
•	allCodes = [].
•	detectedRoom = "".
•	Vòng lặp xử lý từng file:
•	Cập nhật aiStatus (stage, detail, progress).
•	Call API UploadFile:
•	import { UploadFile } from "@/integrations/Core";
•	const { file_url } = await UploadFile({ file: current_file_in_loop });
•	Giải thích cho ChatGPT: Đây là một tích hợp có sẵn, nhận đối tượng File và trả về { file_url: string }.
•	Call API ExtractDataFromUploadedFile:
•	import { ExtractDataFromUploadedFile } from "@/integrations/Core";
•	const result = await ExtractDataFromUploadedFile({
•	    file_url,
•	    json_schema: { type: "object", properties: { text_content: { type: "string" } } }
•	});
•	Giải thích cho ChatGPT: Đây là một tích hợp AI, nhận file_url và json_schema, trả về object { status: "success" | "error", output: { text_content: string } }. text_content chứa văn bản đã được OCR.
•	Phân tích result.output.text_content:
•	Sử dụng regex /(0424\d+|0423\d+)/g để tìm tất cả các chuỗi khớp.
•	Với mỗi match:
•	Trích xuất room dựa trên các prefix 0424201, 0424202, 0424203, 0424204, 042300, 042410.
•	Trích xuất asset_year (match.slice(-10, -8)), asset_code (parseInt(match.slice(-4), 10)).
•	Định dạng thành asset_code.asset_year (ví dụ: 259.24).
•	Kiểm tra validateAssetFormat và thêm vào allCodes.
•	Cập nhật Form:
•	uniqueCodes = [...new Set(allCodes)].
•	setMultipleAssets(new Array(Math.max(uniqueCodes.length, 1)).fill("").map((_, i) => uniqueCodes[i] || "")).
•	Nếu detectedRoom có giá trị, gọi handleRoomChange(detectedRoom).
•	Hoàn tất/Lỗi:
•	Đóng dialog (setIsImageDialogOpen(false)).
•	Hiển thị message (success/error).
•	Reset aiStatus.
5.3. Hướng dẫn chi tiết cho AI Vibe Code
AI Vibe Code cần tái tạo lại các thay đổi sau vào file pages/AssetEntry.js và đảm bảo các import cần thiết:
1.	Thêm các useState mới:
•	isImageDialogOpen, setIsImageDialogOpen (boolean, false)
•	isProcessingImage, setIsProcessingImage (boolean, false)
•	aiStatus, setAiStatus (object, { stage: "", progress: 0, total: 0, detail: "" })
2.	Thêm input type="file" ẩn: Đặt hai input này ở cuối return của AssetEntry component, ngay trước </div> đóng của p-4 pb-28 ....
<input id="file-input" type="file" accept="image/*" multiple onChange={handleFileUpload} className="hidden" />
<input id="camera-input" type="file" accept="image/*" capture="environment" onChange={handleFileUpload} className="hidden" />
3.	Thêm import cho các tích hợp:
import { UploadFile, ExtractDataFromUploadedFile } from "@/integrations/Core";
4.	Thêm import icons:
import { Camera, Upload, Loader2 } from "lucide-react"; // Đảm bảo đã có Camera
5.	Thêm nút Camera và Dialog vào JSX:
•	Tìm Label có text "Nhập [Mã TS] . [Năm TS]:".
•	Bao bọc Label và DialogTrigger bằng một div để chúng nằm cạnh nhau (flex items-center justify-between).
•	Thêm Dialog JSX vào đúng vị trí của nó.
{/* ... giữ code trước đó của form ... */}
<div className="space-y-2">
   <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-black">
            Nhập [Mã TS] . [Năm TS]: Có dấu
            <span className="font-bold text-red-600"> CHẤM (hoặc PHẨY) </span>
            ở giữa.
        </Label>
        {/* START AI CAMERA DIALOG */}
        <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
           <DialogTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="text-green-600 hover:text-green-700">
                    <Camera className="w-5 h-5" />
                    <span className="text-base font-semibold">AI</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>Chọn cách nhập hình ảnh</DialogTieuDe></DialogHeader>
                <div className="space-y-4">
                    <Button onClick={() => document.getElementById('file-input').click()} className="w-full h-16 bg-blue-500 hover:bg-blue-600 text-white flex items-center gap-3" disabled={isProcessingImage}><Upload className="w-6 h-6" />{isProcessingImage ? "Đang xử lý..." : "Upload từ thiết bị"}</Button>
                    <Button onClick={() => document.getElementById('camera-input').click()} className="w-full h-16 bg-green-500 hover:bg-green-600 text-white flex items-center gap-3" disabled={isProcessingImage}><Camera className="w-6 h-6" />Chụp ảnh</Button>
                    {(isProcessingImage || aiStatus.stage) && (
                      <div className="p-3 rounded-md border bg-slate-50 text-sm flex items-start gap-3">
                        <Loader2 className={`w-4 h-4 mt-0.5 ${isProcessingImage ? 'animate-spin' : ''}`} />
                        <div>
                          <div className="font-medium">{aiStatus.detail || "Đang xử lý..."}</div>
                          {aiStatus.total > 0 && (
                            <div className="mt-2 h-2 bg-slate-200 rounded">
                             <div className="h-2 bg-green-600 rounded" style={{ width: `${Math.min(100, Math.round((aiStatus.progress / Math.max(aiStatus.total, 1)) * 100))}%` }}></div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
        {/* END AI CAMERA DIALOG */}
    </div>
    {/* ... giữ code sau đó của phần nhập mã TS ... */}
</div>
{/* ... giữ code sau đó của form ... */}
6.	Thêm hàm handleFileUpload (trong AssetEntry component):
const handleFileUpload = useCallback((event) => {
   const files = Array.from(event.target.files);
    if (files.length > 0) processImages(files);
    event.target.value = ''; // Reset input
}, [processImages]);
7.	Thêm hàm processImages (trong AssetEntry component):
•	Hàm này cần có access đến validateAssetFormat, handleRoomChange, setMultipleAssets, setIsImageDialogOpen, setAiStatus, setIsProcessingImage, setMessage.
const processImages = useCallback(async (files) => {
    setIsProcessingImage(true);
    setAiStatus({ stage: "starting", progress: 0, total: files.length, detail: "Đang chuẩn bị xử lý hình ảnh..." });
    setMessage({ type: "", text: "" });
    try {
        const allCodes = [];
        let detectedRoom = "";

        let index = 0;
        for (const file of files) {
            index += 1;
          setAiStatus({ stage: "uploading", progress: index - 1, total: files.length, detail: `Đang tải ảnh ${index}/${files.length}...` });
          const { file_url } = await UploadFile({ file });

            setAiStatus({ stage: "extracting", progress: index - 1, total: files.length, detail: `Đang đọc mã từ ảnh ${index}/${files.length}...` });
            const result = await ExtractDataFromUploadedFile({ file_url, json_schema: { type: "object", properties: { text_content: { type: "string" } } } });

            if (result.status === "success" && result.output?.text_content) {
                const matches = result.output.text_content.match(/(0424\d+|0423\d+)/g) || [];
                for (const match of matches) {
                    if (match.length >= 10) { // Đảm bảo độ dài tối thiểu
                        const prefix7 = match.substring(0, 7);
                        const prefix6 = match.substring(0, 6);
                        let room = "";
                       // Logic xác định phòng ban
                        if (prefix7 === "0424201") room = "CMT8";
                       else if (prefix7 === "0424202") room = "NS";
                        else if (prefix7 === "0424203") room = "ĐS";
                        else if (prefix7 === "0424204") room = "LĐH";
                        else if (prefix6 === "042300") room = "DVKH";
                        else if (prefix6 === "042410") room = "QLN";

                        // Nếu tìm thấy phòng ban và nó khớp hoặc chưa có phòng ban nào được phát hiện
                        if (room && (!detectedRoom || detectedRoom === room)) {
                            detectedRoom = room;
                            const year = match.slice(-10, -8); // 2 ký tự năm
                            const code = parseInt(match.slice(-4), 10); // 4 ký tự mã
                            const formatted = `${code}.${year}`;
                            if (validateAssetFormat(formatted)) { // Kiểm tra định dạng 259.24
                                allCodes.push(formatted);
                            }
                        }
                    }
                }
            }
            setAiStatus({ stage: "progress", progress: index, total: files.length, detail: `Đã xử lý ${index}/${files.length} ảnh` });
        }

        if (allCodes.length === 0) {
            setAiStatus({ stage: "done", progress: files.length, total: files.length, detail: "Không tìm thấy mã tài sản hợp lệ." });
            setMessage({ type: "error", text: "Không tìm thấy mã tài sản hợp lệ trong hình ảnh." });
            return;
        }
        const uniqueCodes = [...new Set(allCodes)]; // Lọc trùng
        if (detectedRoom) handleRoomChange(detectedRoom); // Cập nhật phòng ban
        // Cập nhật mảng multipleAssets, đảm bảo luôn có ít nhất 1 ô nhập
        setMultipleAssets(new Array(Math.max(uniqueCodes.length, 1)).fill("").map((_, i) => uniqueCodes[i] || ""));
        setIsImageDialogOpen(false); // Đóng dialog
        setAiStatus({ stage: "done", progress: files.length, total: files.length, detail: `Đã điền ${uniqueCodes.length} mã tài sản.` });
        setMessage({ type: "success", text: `Đã điền ${uniqueCodes.length} mã tài sản.` });
    } catch (error) {
        setAiStatus({ stage: "error", progress: 0, total: 0, detail: "Có lỗi xảy ra khi xử lý hình ảnh." });
        setMessage({ type: "error", text: "Có lỗi xảy ra khi xử lý hình ảnh!" });
    } finally {
        setIsProcessingImage(false);
        setTimeout(() => setAiStatus({ stage: "", progress: 0, total: 0, detail: "" }), 1200); // Xóa trạng thái AI sau 1.2s
    }
}, [validateAssetFormat, handleRoomChange, setMultipleAssets, setIsImageDialogOpen, setAiStatus, setIsProcessingImage, setMessage]);
________________________________________
Với các hướng dẫn chi tiết về chức năng, logic, luồng và các đoạn code cụ thể, AI có thể tự tin tái tạo chính xác chức năng "Tích hợp AI Camera" trên trang "AssetEntry".
===
Dưới đây là bản đặc tả chi tiết, tuần tự theo luồng, để tái tạo chính xác các tính năng AI (Custom và OpenRouter, KHÔNG dùng hội ý “chain”) trên Care My Life, chạy frontend React + Vite + Typescript trên Vercel và backend Supabase. Tôi trình bày đầy đủ cấu trúc màn hình, tên nút, logic dữ liệu, luồng gọi API/Edge Function, trạng thái và xử lý lỗi, cũng như mối liên hệ với Database (schema đã tồn tại trong Supabase Context bạn cung cấp). Mục tiêu: triển khai lại mà không phát sinh lỗi, bám sát hiện trạng codebase.
Tổng quan phạm vi
•	Frontend: React + Vite + Typescript, deploy Vercel. UI đã có:
•	AI Settings Tab (cấu hình AI chung).
•	My Life — AI Settings (cấu hình AI riêng cho My Life).
•	AI Analysis Panel (phân tích deal & range, test stream).
•	Các màn hình liên quan: Schedules (lịch tự động), Reports, Prompt Editor.
•	Backend: Supabase Database + Edge Functions (Deno) + Row Level Security đã bật đầy đủ.
•	Không dùng “chain”:
•	Không dùng openrouter_chain_models hoặc custom_chain_models để hội ý nhiều model.
•	Chỉ dùng một model “mặc định” theo provider (OpenRouter: default_openrouter_model, Custom: custom_model).
Phần A. Cấu hình AI — AI Settings Tab (chung)
1.	Vị trí và thiết kế UI
•	Tab “API Keys & Base URLs” trong AISettingsTab:
•	Khối “OpenAI / ChatGPT”:
•	Trường “API Key” (ẩn/hiện bằng nút con mắt).
•	Trường “Base URL” (mặc định https://api.openai.com).
•	Nút “Lưu”.
•	Nút “Đặt mặc định”.
•	Nút “Test”.
•	Khối “Google Gemini”:
•	API Key, Base URL (mặc định https://generativelanguage.googleapis.com).
•	Nút “Lưu”, “Đặt mặc định”, “Test”.
•	Khối “OpenRouter”:
•	API Key.
•	Base URL: mặc định https://openrouter.ai/api/v1.
•	KHÔNG hiển thị phần “Hội ý (chain)” (bỏ 3 select chain).
•	Nút “Tải lại models” (vẫn hữu ích để chọn model default).
•	Nút “Lưu”, “Đặt mặc định”, “Test”.
•	Khối “Custom AI”:
•	API Key.
•	Base URL: https://v98store.com (OpenAI-compatible).
•	KHÔNG hiển thị phần “Hội ý (chain)” (bỏ 3 ô nhập chain).
•	Nút gợi ý nhanh các tên model (có thể giữ để điền nhanh, nhưng vẫn chỉ dùng 1 model).
•	Nút “Lưu”, “Đặt mặc định”, “Test”.
•	Các nút hiển thị: “Lưu”, “Đặt mặc định”, “Test”, “Tải lại models”, nút ẩn/hiện API Key (Eye/EyeOff).
•	Tab “Lịch tự động” (schedules):
•	Checkbox và inputs cho daily/weekly/monthly (enabled, time/day).
•	Selector “Timezone” (ví dụ Asia/Ho_Chi_Minh).
•	Nút “Lưu lịch”.
•	Nút “Chạy ngay” cho từng chế độ (Ngày/Tuần/Tháng).
•	Preview lịch chạy tiếp theo + danh sách 5 log gần nhất.
2.	Dữ liệu và Database liên quan (ai_settings)
•	Bảng public.ai_settings (đã có trong Supabase, có chính sách RLS):
•	Trường dùng trực tiếp:
•	default_provider: openai | gemini | openrouter | custom
•	default_openrouter_model: chuỗi model OpenRouter (ví dụ openrouter/auto hoặc cụ thể)
•	custom_model: chuỗi model Custom (ví dụ gpt-4o-mini hoặc gemini-2.5-flash)
•	openai_api_key, gemini_api_key, openrouter_api_key, custom_api_key
•	openai_base_url, gemini_base_url, openrouter_base_url, custom_base_url
•	daily/weekly/monthly analysis settings (time, day, enabled)
•	timezone
•	ai_text_formatting_enabled
•	manual_analysis_behavior (‘append’ | ‘overwrite’)
•	default_consultation_mode (UI vẫn có; khi “không chain” ta chỉ cần đảm bảo mọi logic không nhân bản model)
•	coach_ai_mode (‘prefer’ | ‘always’ | ‘never’) dùng cho Coach.
•	KHÔNG dùng:
•	openrouter_chain_models, custom_chain_models: để rỗng và bỏ UI liên quan.
•	Luồng đọc/ghi:
•	GET /api/ai/settings: đọc đầy đủ settings, hiển thị UI.
•	POST /api/ai/settings: patch những trường thay đổi. Lưu ý validation Base URL phải có “http(s)://”.
•	Test Connection:
•	POST /api/ai/test-connection → Supabase Edge function “ai-test-connection”:
•	Với OpenRouter: cần model gửi cùng payload, “chat/completions” endpoint OpenRouter.
•	Với Custom: base là https://v98store.com, endpoint /v1/chat/completions, model là custom_model.
•	Kết quả: hiển thị “Thành công”/“Thất bại” với thông báo cụ thể.
3.	Logic chọn Provider/Model (không chain)
•	Ưu tiên 1 provider duy nhất (theo default_provider).
•	Model duy nhất:
•	OpenRouter: dùng default_openrouter_model (nếu trống fallback 'openrouter/auto').
•	Custom: dùng custom_model (khuyến nghị: ‘gpt-4o-mini’ hoặc ‘gemini-2.5-pro’ tùy hệ thống).
•	OpenAI: dùng model tĩnh ‘gpt-4o-mini’.
•	Gemini: dùng model tĩnh ‘gemini-2.5-pro’.
•	Bỏ hoàn toàn logic “chain_models” (không lặp qua mảng, không hội ý nhiều model).
4.	Xử lý lỗi/UX
•	Lưu settings:
•	Nếu Base URL không hợp lệ: hiển thị toast “Base URL không hợp lệ”.
•	Nếu API Key trống: hiển thị “Thiếu API key” và không gọi Test.
•	Test:
•	Timeout 20s; hiển thị trạng thái “đang test…”;
•	Kết quả ghi lại message, payload đã gửi (hữu ích debug).
Phần B. Cấu hình AI cho My Life — MyLifeAISettings (riêng)
1.	Vị trí và thiết kế UI
•	Panel “My Life — AI Settings”:
•	Radio Provider: ‘custom’ (mặc định) | ‘openrouter’.
•	Trường “API Key” và “Base URL” theo provider đã chọn:
•	Với Custom: Base URL là https://v98store.com (ghi chú: “OpenAI-compatible base domain; hệ thống sẽ gọi: base/v1/chat/completions”).
•	Với OpenRouter: Base URL https://openrouter.ai/api/v1.
•	Trường “Model” duy nhất (KHÔNG chain):
•	Custom: custom_model.
•	OpenRouter: openrouter_model.
•	Nút “Lưu cấu hình”.
•	Nút “Thử gọi AI”:
•	Gửi một PastePack mẫu và nhận “analysis” từ Supabase function “mylife-ai-analyze-range” hoặc “mylife-habit-suggest/…advisor” (tuỳ test).
•	Hiển thị flags “Đã lưu trên server” cho API Key từng provider.
•	Log kết quả test (payload, thời điểm, HTTP status).
2.	Dữ liệu và Database (mylife_ai_settings)
•	Bảng public.mylife_ai_settings (đã có):
•	provider: ‘custom’|’openrouter’
•	openrouter_api_key, openrouter_base_url, openrouter_model
•	custom_api_key, custom_base_url, custom_model
•	Luồng:
•	GET/POST /api/mylife/ai-settings (Edge runtime) để đọc/ghi.
•	GET /api/mylife/ai-health: kiểm tra “tình trạng” cấu hình, gợi ý nếu thiếu key.
•	Không dùng chain: bỏ mọi logic về danh sách model.
Phần C. Phân tích AI — AI Analysis Panel (Deal & Range)
1.	Màn hình “Phân tích Deal”
•	Inputs:
•	“Deal ID”.
•	Provider (ẩn khi Simple Mode; mặc định dùng từ ai_settings).
•	Template (chọn template trong bảng ai_analysis_templates; hiển thị “System prompt” preview tuỳ chọn).
•	Temperature (0..1).
•	Nút:
•	“Phân tích” (enqueue + run theo job) hoặc gọi trực tiếp tuỳ chế độ:
•	Kịch bản không chain: job sẽ dùng 1 model duy nhất theo provider.
•	“Stream”: gọi Supabase function “ai-analyze-deal-stream” để nhận stream data (OpenAI-style).
•	“Dừng” (khi stream).
•	Tùy Simple/Advanced: UI đơn giản 1 nút hoặc nhiều nút.
•	Kết quả:
•	Hiển thị “Phân tích AI” hoặc bộ ba (openai/gemini/openrouter) nếu mode khác (UI hiện có cho “both/triple”).
•	Copy, Copy .md, Tải xuống .txt, .md.
2.	Màn hình “Phân tích Range”
•	Inputs:
•	Preset khoảng thời gian (Hôm nay/Tuần này/Tháng này/Custom).
•	Ngày “Từ”/“Đến”.
•	Nút “Phân tích” (gọi /api/ai/analyze-range — proxy tới Supabase function “ai-analyze-range”).
•	Nút “Chạy báo cáo (Custom)” (Edge function variances).
•	Nút “Tạo input đầy đủ (copy cho AI)”.
•	Kết quả:
•	Hiển thị Markdown phân tích.
•	KPI summary nếu có.
•	Nút “Lưu vào Đánh giá”:
•	“Ngày”/“Tuần”/“Tháng” — ghi vào bảng daily_evaluations/weekly_evaluations/monthly_evaluations.
•	Hành vi “append”/“overwrite” dựa vào ai_settings.manual_analysis_behavior.
•	Không chain:
•	Supabase function “ai-analyze-range” và “ai-run-now” sẽ pick 1 model duy nhất theo provider.
3.	Template AI (ai_analysis_templates)
•	Ưu tiên:
•	is_default → key ‘all_vi’ → first.
•	“System prompt preview” có nút “Hiện/Ẩn”.
•	Nút “Đặt làm mặc định”.
•	Database: public.ai_analysis_templates (đã có trong schema).
4.	Logic kỹ thuật (không chain)
•	Client:
•	Gọi /api/ai/analyze-range với body: fromISO, toISO, locale ‘vi’, mode=‘single’, templateKey (tuỳ chọn), temperature.
•	Không gửi chain_models; không chuyển qua nhiều model.
•	Supabase function “ai-analyze-range”:
•	Resolve provider & model duy nhất.
•	Với Custom:
•	Base URL (custom_base_url), endpoint chat/completions (OpenAI-compatible), Authorization Bearer custom_api_key.
•	Model = custom_model.
•	Với OpenRouter:
•	Base URL (openrouter_base_url), endpoint chat/completions, Authorization Bearer openrouter_api_key.
•	Model = default_openrouter_model.
•	Stream hoặc non-stream: tuỳ function; đọc SSE để build nội dung.
•	Xây PastePack nếu chưa cung cấp input (tổng hợp từ forex_deals + daily_life_journals).
•	Xử lý timeout & retry:
•	Client: timeout 120–300s tuỳ nơi (đã có trong code).
•	Server: stream đọc finish_reason, retry tiếp tục nếu bị cắt (đã có logic auto-continue ở “mylife-ai-analyze-range”).
Phần D. Lịch tự động — Auto Analysis & “Run Now”
1.	Lịch tự động trên client (useAutoAIAnalysis)
•	Chạy mỗi phút (đồng bộ theo timezone người dùng).
•	Tính thời điểm daily/weekly/monthly theo cài đặt ai_settings.
•	Khi đến giờ:
•	Gọi /api/ai/analyze-range để lấy analysis rồi cập nhật đánh giá (append kèm dấu thời gian) vào daily/weekly/monthly (bảng tương ứng).
•	Không chain:
•	Gọi duy nhất 1 provider/model.
2.	“Run Now” (nút trong AIAnalysisPanel/AISettings Schedules)
•	Gọi Supabase function “ai-run-now”:
•	Xác định fromISO/toISO theo hiện tại và timezone, pick provider+model từ ai_settings.
•	Invoke “ai-analyze-range” (server side) để lấy phân tích.
•	Lưu thẳng vào daily/weekly/monthly_evaluations + thêm record ai_analysis_reports.
•	Thông báo Push/Email: đã có logic trong function (OneSignal/Resend), tự động bỏ qua nếu user đang online (heartbeat fresh).
Phần E. Coach AI (tham chiếu vì có dùng provider)
•	Edge functions: “coach-suggest”, “coach-scheduler”, “coach-orchestrator”, “coach-push-atomic”.
•	Cấu hình ai_settings.coach_ai_mode (‘prefer’|‘always’|‘never’):
•	prefer: nếu có key thì gọi AI, nếu không dùng heuristic.
•	always: cưỡng bức gọi AI.
•	never: chỉ heuristic.
•	Không chain:
•	Chỉ gọi 1 model duy nhất theo default_provider (OpenRouter hoặc Custom) nếu có key; Gemini/OpenAI cũng chỉ 1 model mặc định.
•	Lưu gợi ý vào bảng warnings (đã có trigger và function hỗ trợ), mentor_ab_events để log exposure.
Phần F. Bản đồ endpoint và luồng gọi Frontend → API (Vercel Edge) → Supabase Function/API → Database.
1.	Cấu hình AI
•	GET /api/ai/settings → đọc ai_settings (UI AI Settings Tab).
•	POST /api/ai/settings → lưu patch ai_settings.
•	GET/POST /api/mylife/ai-settings → đọc/ghi mylife_ai_settings (UI My Life — AI Settings).
•	POST /api/ai/test-connection → Edge function ai-test-connection (provider, api_key, base_url, model).
•	GET /api/mylife/ai-health → kiểm tra cấu hình MyLife AI.
2.	Phân tích deal
•	POST /api/ai/analyze-deal → Edge function ai-analyze-deal (enqueue/direct/run/status).
•	POST /api/ai/analyze-deal-stream → Edge function ai-analyze-deal-stream (stream).
•	Lưu job vào ai_deal_jobs, trạng thái queued/processing/succeeded/failed, result_analysis.
3.	Phân tích range
•	POST /api/ai/analyze-range → Edge function ai-analyze-range (direct/stream/queue-run-status).
•	Lưu job vào ai_range_jobs, hoặc trả về analysis trực tiếp.
•	“Run Now” → Edge function ai-run-now → invoke ai-analyze-range → cập nhật daily/weekly/monthly + ai_analysis_reports.
4.	My Life AI
•	POST /supabase/functions/mylife-ai-analyze-range: dành cho phân tích My Life (auto-continue khi bị cắt length).
•	POST /supabase/functions/mylife-habit-suggest, /mylife-advisor, /goal-decomposer: sử dụng provider & model từ mylife_ai_settings; KHÔNG chain, model duy nhất.
Phần G. Quy tắc chọn Template và System Prompt
•	Ưu tiên is_default; tiếp theo key ‘all_vi’; sau cùng là phần tử đầu.
•	Khi người dùng chọn template khác:
•	Gán templateKey, temperature từ template.
•	Có nút “Đặt làm mặc định” (persist ai_analysis_templates.is_default).
•	“System prompt” preview:
•	Nút “Hiện/Ẩn System prompt”.
•	Chỉ là preview; khi gọi AI, server dùng templateOverride.system nếu cung cấp.
•	Không chain:
•	System prompt áp dụng lên 1 model duy nhất.
Phần H. Trạng thái, kiểm soát và thông báo
•	Toasts cho mọi hành động lưu/test/chạy ngay/lỗi mạng.
•	Loading/Testing tiết kiệm: disabled nút khi đang tiến trình.
•	Stream: cung cấp nút “Dừng” để abort stream.
•	Auto-copy: cấu hình “Tự động copy khi hoàn tất”.
Phần I. RLS, bảo mật và quyền
•	RLS đã bật trên tất cả bảng (như Supabase Context).
•	Luồng xử lý:
•	Client gọi Edge function luôn kèm “Authorization: Bearer {session.access_token}”.
•	Edge function tự lấy user từ supabase.auth.getUser() hoặc chế độ “service” khi có service role (scheduler).
•	Không bao giờ trả về secret API Key trong response UI (chỉ flags “đã lưu hay chưa”).
Phần J. Chi tiết đặc thù “không chain”
1.	Bỏ chain ở UI
•	OpenRouter:
•	Không hiển thị 3 select “Hội ý (chain)”.
•	Chỉ hiển thị một input/select “Model”.
•	Custom:
•	Không hiển thị 3 input “Hội ý (chain)”.
•	Chỉ hiển thị một input “Model”.
•	Nút “Tải lại models” vẫn giữ cho OpenRouter (để người dùng chọn 1 model “mặc định”).
•	Nút “Gợi ý nhanh” trong Custom vẫn chỉ gán vào ô “model” duy nhất.
2.	Bỏ chain ở logic chọn
•	pickProviderAndModel: trả về 1 provider, 1 model duy nhất.
•	Mọi nơi trước kia tham chiếu chain_models[0] → thay bằng default model field (default_openrouter_model hoặc custom_model).
•	Không lặp qua mảng chain để gọi nhiều provider/model.
3.	Bỏ chain ở Edge Functions
•	Caller luôn build payload với “model” duy nhất.
•	Với Custom (https://v98store.com): endpoint cố định “/v1/chat/completions”.
•	Với OpenRouter: endpoint “{base}/chat/completions”.
•	Headers:
•	Authorization: Bearer API_KEY.
•	Với OpenRouter: thêm “HTTP-Referer” và “X-Title” (tuỳ chức năng đã có trong code, có thể giữ).
•	Không dùng response_format “array” cho chain; chỉ json_object hoặc sse.
Phần K. Luồng end-to-end minh họa (không chain)
1.	Người dùng vào AI Settings:
•	Chọn “Custom AI” → nhập API Key → Base URL “https://v98store.com” → model “gpt-4o-mini” → bấm “Lưu”.
•	Bấm “Đặt mặc định”.
•	Bấm “Test”: hệ thống gửi payload {provider: 'custom', api_key, base_url: 'https://v98store.com', model: 'gpt-4o-mini'} đến ai-test-connection → OK.
2.	Người dùng qua AI Analysis Panel → “Phân tích Deal”:
•	Nhập “Deal ID”.
•	Bấm “Phân tích”:
•	Client POST /api/ai/analyze-deal {dealId, provider: 'custom', model: 'gpt-4o-mini', templateKey, temperature}.
•	Edge function “ai-analyze-deal” xác định model duy nhất, gọi https://v98store.com/v1/chat/completions, tạo nội dung → trả về analysis.
3.	Người dùng qua “Phân tích Range” (preset “Tuần này”):
•	Bấm “Phân tích”:
•	Client POST /api/ai/analyze-range {fromISO, toISO, locale: 'vi', provider: 'custom', model: 'gpt-4o-mini'}.
•	Edge function “ai-analyze-range” xây PastePack nếu thiếu, gọi Custom 1 lần, stream hoặc non-stream → trả về analysis.
•	Bấm “Lưu vào Đánh giá → Tuần”:
•	Lưu vào weekly_evaluations theo behavior append/overwrite.
4.	“Run Now” Tuần:
•	Bấm “Tuần” trong Schedules:
•	Edge function “ai-run-now” lookup provider/model duy nhất từ ai_settings.
•	Invoke “ai-analyze-range”.
•	Lưu daily/weekly/monthly tương ứng + ai_analysis_reports → thông báo push/email khi user offline.
Phần L. Xử lý stream và nội dung lớn
•	Khi văn bản rất dài:
•	“Chế độ nội dung lớn” → ép dùng Stream + Raw view.
•	Tự động chuyển “defaultView” sang Raw nếu vượt ngưỡng.
•	Stream endpoint:
•	ai-analyze-deal-stream: trả text chunks trong thời gian thực.
•	Đảm bảo “abort()” dừng stream.
Phần M. Mối liên hệ các bảng khác
•	ai_deal_jobs, ai_range_jobs: trạng thái job AI (queued/processing/succeeded/failed).
•	ai_analysis_reports: snapshot kết quả cho báo cáo.
•	daily_evaluations/weekly_evaluations/monthly_evaluations: nơi lưu analysis cuối (append/overwrite).
•	warnings & mentor_ab_events: gợi ý từ Coach và log exposure.
•	mylife_ai_jobs: job riêng cho My Life (enqueue/status/run).
•	mối liên hệ RLS đã sẵn sàng trong Supabase Context.
Phần N. Tiêu chí hoàn thành & kiểm thử
•	Không hiển thị bất kỳ phần chọn “chain” trên UI.
•	Mọi gọi AI đều truyền đúng:
•	Custom:
•	Base URL: https://v98store.com
•	Endpoint: /v1/chat/completions
•	Model: custom_model
•	OpenRouter:
•	Base URL: https://openrouter.ai/api/v1 (hoặc user-config)
•	Endpoint: /chat/completions
•	Model: default_openrouter_model
•	Các flows:
•	Test connection: trả về success và message “Connection OK”.
•	Phân tích Deal/Range: trả về analysis không lỗi, có timeout hợp lý.
•	Lưu đánh giá: “append” và “overwrite” hoạt động.
•	Run Now: ghi đánh giá + tạo report.
•	Lịch tự động: đúng giờ timezone, không duplicate trong ngày/tuần/tháng.
•	Bảo mật:
•	Không trả secret keys về client.
•	Mọi table theo RLS; dùng session access token.
Phần O. Gợi ý UI nhỏ (tham chiếu ảnh)
•	OpenRouter:
•	Nhãn: “OpenRouter”.
•	Trường: “API Key”, “Base URL”.
•	Nút: “Tải lại models”, “Lưu”, “Đặt mặc định”, “Test”.
•	Ghi chú: “Truy cập nhiều AI models qua một API”.
•	Custom AI:
•	Nhãn: “Custom AI”.
•	Trường: “API Key”, “Base URL” (placeholder “https://v98store.com”), “Model”.
•	Nút: “Lưu”, “Đặt mặc định”, “Test”.
•	Gợi ý nhanh: các chip đề xuất (ví dụ gemini-2.5-flash, claude-3.5-sonnet…); khi click thì điền vào Model duy nhất (không chain).
•	Ghi chú: “OpenAI-compatible base domain; hệ thống sẽ gọi: base/v1/chat/completions”.
Kết luận
•	Đặc tả này giữ nguyên toàn bộ logic hiện có, nhưng loại bỏ hoàn toàn “hội ý chain”.
•	Tất cả các tính năng AI đều dùng một provider và một model duy nhất dựa trên cài đặt người dùng.
•	Mọi luồng (cấu hình, test, phân tích deal/range, stream, lưu đánh giá, lịch tự động, run now) đều bám sát endpoint và Edge Function hiện hữu trong codebase, phù hợp cho frontend React + Vite + TS trên Vercel và backend Supabase, đảm bảo không phát sinh lỗi nếu triển khai đúng như mô tả.

