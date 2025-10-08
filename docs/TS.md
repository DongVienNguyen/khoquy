Chào bạn, đây là tài liệu chi tiết về trang "AssetEntry" (Thông báo Mượn/Xuất) để AI có thể hiểu rõ và tái tạo chính xác mà không gặp lỗi.
________________________________________
1. Tổng quan trang "AssetEntry"
Trang "AssetEntry" là giao diện chính cho phép nhân viên ghi nhận các giao dịch liên quan đến tài sản như mượn, xuất kho, hoặc thay bìa. Mục tiêu là cung cấp một công cụ nhanh chóng, chính xác, và dễ sử dụng, với các chức năng tự động điền thông tin và hỗ trợ AI cho việc nhập liệu.
•	Mục đích: Ghi nhận các giao dịch tài sản vào hệ thống.
•	Đối tượng sử dụng: Toàn bộ nhân viên (cả người dùng thông thường và quản trị viên).
•	Các tính năng cốt lõi:
•	Nhập liệu nhanh với các giá trị mặc định thông minh.
•	Hỗ trợ nhập nhiều mã tài sản cùng lúc.
•	Tích hợp AI để đọc mã tài sản từ hình ảnh.
•	Hệ thống thông báo tình trạng gửi dữ liệu.
•	Phản hồi nhanh về các giao dịch đã gửi trong ngày.
•	Tuân thủ các khung giờ giới hạn nhập liệu cho người dùng thông thường.
________________________________________
2. Thiết kế Database (Entities)
Trang "AssetEntry" tương tác chủ yếu với các entity sau:
2.1. AssetTransaction (Giao dịch Tài sản)
Đây là entity chính để lưu trữ thông tin các giao dịch tài sản được gửi từ trang này.
•	Schema:
•	id: string (tự động tạo)
•	created_date: string (ISO datetime string, tự động tạo)
•	updated_date: string (ISO datetime string, tự động cập nhật)
•	created_by: string (email người tạo, tự động tạo)
•	transaction_date: string (định dạng yyyy-MM-dd, Ngày thực hiện giao dịch, BẮT BUỘC)
•	parts_day: string (enum: "Sáng", "Chiều", Buổi trong ngày, BẮT BUỘC)
•	room: string (enum: "QLN", "CMT8", "NS", "ĐS", "LĐH", "DVKH", Phòng ban liên quan, BẮT BUỘC)
•	transaction_type: string (enum: "Xuất kho", "Mượn TS", "Thay bìa", Loại hình giao dịch, BẮT BUỘC)
•	asset_year: integer (Năm của tài sản, ví dụ 24 cho 2024, từ 20-99, BẮT BUỘC)
•	asset_code: integer (Mã số của tài sản, BẮT BUỘC)
•	staff_code: string (Mã nhân viên thực hiện giao dịch, lấy từ currentUser.username, BẮT BUỘC)
•	note: string (Ghi chú tùy chọn, ví dụ: "Ship PGD", "Lấy ở CN" hoặc ghi chú cho QLN. Chỉ BẮT BUỘC nếu room là 'CMT8', 'NS', 'ĐS', 'LĐH' và note không rỗng.)
•	notified_at: string (ISO datetime string, thời gian người dùng nhấn nút gửi, dùng cho mục đích hiển thị "Time nhắn" ở GMT+7)
•	is_deleted: boolean (default: false, đánh dấu xóa mềm)
•	deleted_at: string (ISO datetime string, thời điểm xóa mềm)
•	deleted_by: string (username người thực hiện xóa mềm)
•	change_logs: array (Lưu trữ lịch sử thay đổi của giao dịch, mỗi phần tử là một object có: time (ISO datetime), field (tên trường thay đổi hoặc 'delete'), old_value, new_value, edited_by (username))
2.2. Staff (Nhân viên)
Sử dụng để xác thực người dùng, lấy thông tin phòng ban và vai trò.
•	Schema (các trường liên quan):
•	id: string
•	username: string (mã nhân viên, duy nhất)
•	staff_name: string (tên đầy đủ)
•	role: string (enum: "admin", "user")
•	department: string (phòng ban của nhân viên)
•	account_status: string (enum: "active", "locked")
2.3. EmailUser (Người dùng Email)
Sử dụng để ghi nhận thời điểm gửi thông báo cuối cùng, không còn dùng để gửi email trực tiếp.
•	Schema (các trường liên quan):
•	username: string
•	last_notification_sent: string (ISO datetime string, thời điểm gửi thông báo/nhấn nút gửi gần nhất, GMT+7)
•	last_email_sent: string (ISO datetime string, giữ đồng bộ với last_notification_sent cho báo cáo)
2.4. Notification (Thông báo In-app)
Sử dụng để tạo và lưu trữ các thông báo hiển thị trực tiếp trong ứng dụng.
•	Schema (các trường liên quan):
•	title: string
•	message: string
•	recipient_username: string (username người nhận thông báo)
•	notification_type: string (enum: "asset_reminder", "crc_reminder", "general")
•	is_read: boolean (default: false)
•	related_data: string (JSON string, chứa dữ liệu bổ sung liên quan đến thông báo)
________________________________________
3. Thiết kế UI/Components và Logic
Trang AssetEntry được xây dựng bằng React với Shadcn/ui và Tailwind CSS.
3.1. Header chính
•	Tiêu đề: "Thông báo Mượn/Xuất" (h1).
•	Mô tả:
•	Nếu currentUser.role === 'admin': "Không giới hạn thời gian cho Admin".
•	Nếu currentUser.role === 'user': "Khung giờ 7:45-8:05 và 12:45-13:05 hãy nhắn Zalo vì đã chốt DS".
•	Icon: Package (Lucide React).
3.2. Hướng dẫn (Instruction Card)
•	Một Card với CardTitle chứa văn bản hướng dẫn định dạng mã tài sản: "Từ Phải sang Trái: 2 ký tự thứ 9 và 10 là Năm TS: 24; 4 ký tự cuối là Mã TS: 259 - vd: 0424102470200259".
3.3. Form nhập liệu chính
Các trường nhập liệu nằm trong một <form> và được quản lý bằng state formData.
•	Phòng (Room)
•	Loại: Select dropdown.
•	Tên field: room.
•	Options: "QLN", "CMT8", "NS", "ĐS", "LĐH", "DVKH".
•	Logic mặc định: Khi component mount hoặc currentStaff được tải, room sẽ được đặt mặc định dựa trên currentStaff.department nếu department của staff nằm trong danh sách options.
•	handleRoomChange:
•	Cập nhật formData.room.
•	Cập nhật formData.parts_day dựa trên getDefaultPartsDay(selectedRoom).
•	Cập nhật formData.note: nếu room === 'QLN' thì note rỗng, ngược lại thì note là "Ship PGD".
•	Ghi chú (Note)
•	Loại: Hiển thị có điều kiện.
•	Tên field: note.
•	Logic hiển thị:
•	Nếu formData.room === 'QLN': hiển thị Textarea cho phép nhập ghi chú tự do.
•	Nếu formData.room thuộc về ["CMT8", "NS", "ĐS", "LĐH"]: hiển thị Select dropdown với options: "Ship PGD", "Lấy ở CN".
•	Các trường hợp khác (ví dụ formData.room === 'DVKH' hoặc rỗng): Không hiển thị trường ghi chú.
•	Logic mặc định: Được set khi handleRoomChange được gọi.
•	Validation: Nếu trường ghi chú hiển thị và room không phải 'QLN', thì note phải có giá trị.
•	Nhập [Mã TS] . [Năm TS] (Input cho nhiều mã tài sản)
•	Loại: Input type="text", hỗ trợ nhiều dòng nhập liệu.
•	State: multipleAssets (array of strings, ví dụ: ["259.24", "123.23"]). Khởi tạo với 1 ô rỗng [""].
•	Mỗi ô input:
•	inputMode="decimal", lang="en-US" (để gợi ý keyboard iOS dùng dấu chấm).
•	pattern="[0-9.,]*" (cho phép cả chấm và phẩy).
•	autoComplete="off", autoCorrect="off".
•	handleAssetChange(index, value):
•	Chuyển đổi phẩy (,) thành chấm (.).
•	Chỉ cho phép số và dấu chấm: replace(/[^0-9.]/g, '').
•	Ngăn không cho nhiều hơn 1 dấu chấm: replace(/(\..*)\./g, '$1').
•	Giới hạn 2 chữ số sau dấu chấm: replace(/(\.\d\d)\d+$/, '$1').
•	Giới hạn 4 chữ số trước dấu chấm: replace(/(\d{4})\d+/, '$1').
•	Validation realtime (isAssetValid):
•	Mỗi mã phải theo định dạng ^\d{1,4}\.\d{2}$.
•	Năm tài sản (2 chữ số sau dấu chấm) phải từ 20 đến 99.
•	Hiển thị icon CheckCircle (xanh) nếu hợp lệ hoặc AlertCircle (đỏ) nếu không hợp lệ.
•	Thêm/Xóa dòng:
•	Nút Plus để thêm một ô input mới vào multipleAssets.
•	Nút Minus để xóa một ô input (không thể xóa nếu chỉ còn 1 ô).
•	Hiển thị thêm/thu gọn:
•	Nếu có hơn 5 mã tài sản, chỉ hiển thị 5 ô đầu tiên.
•	Nút "Xem thêm X" (ChevronDown) để hiển thị tất cả.
•	Nút "Thu gọn" (ChevronUp) để ẩn bớt.
•	Chức năng AI Camera/Upload (Dialog):
•	Trigger: Nút Camera kèm chữ "AI" bên cạnh các input mã tài sản. Mở Dialog.
•	Nội dung Dialog: 2 nút: "Upload từ thiết bị" (kích hoạt <input type="file">) và "Chụp ảnh" (kích hoạt <input type="file" capture="environment">).
•	processImages(files):
•	Set isProcessingImage = true và aiStatus để hiển thị tiến trình.
•	Duyệt từng file:
•	UploadFile({ file }) để tải ảnh lên, nhận file_url.
•	ExtractDataFromUploadedFile({ file_url, json_schema: { type: "object", properties: { text_content: { type: "string" } } } }) để trích xuất văn bản từ ảnh.
•	Logic trích xuất mã: Tìm các chuỗi khớp với regex /(0424\d+|0423\d+)/g.
•	Nếu tìm thấy chuỗi 10 ký tự trở lên:
•	Phân tích 6-7 ký tự đầu để xác định room (ví dụ: 0424201 -> CMT8, 042300 -> DVKH).
•	Trích xuất năm (ký tự 9,10 từ cuối) và mã (4 ký tự cuối) để tạo mã X.YY.
•	Chỉ thêm vào danh sách nếu room nhất quán giữa các ảnh và mã hợp lệ.
•	Nếu tìm thấy mã:
•	Nếu detectedRoom không rỗng, tự động set formData.room.
•	Set multipleAssets với các mã duy nhất tìm được.
•	Đóng dialog, hiển thị thông báo thành công.
•	Nếu không tìm thấy: Hiển thị thông báo lỗi.
•	Reset isProcessingImage và aiStatus.
•	Loại tác nghiệp Xuất/Mượn/Thay bìa (Transaction Type)
•	Loại: Select dropdown.
•	Tên field: transaction_type.
•	Options: "Xuất kho", "Mượn TS", "Thay bìa".
•	Buổi và ngày lấy TS (Parts Day & Transaction Date)
•	Buổi (Parts Day)
•	Loại: Select dropdown.
•	Tên field: parts_day.
•	Options: "Sáng", "Chiều".
•	getDefaultPartsDay(room) logic:
•	Lấy giờ GMT+7 hiện tại.
•	Nếu 8:00 - 12:45: mặc định "Chiều".
•	Nếu 13:00 - 7:45 (sáng hôm sau):
•	Nếu room là "QLN" hoặc "DVKH": mặc định "Sáng".
•	Nếu room là "CMT8", "NS", "ĐS", "LĐH": mặc định "Chiều".
•	Ngày lấy TS (Transaction Date)
•	Loại: Popover chứa Calendar (Shadcn UI).
•	Tên field: transaction_date (lưu trữ là đối tượng Date trong state, format yyyy-MM-dd khi gửi).
•	Logic mặc định (calculateDefaultValues):
•	Lấy ngày/giờ GMT+7 hiện tại.
•	Nếu hôm nay là Thứ Sáu và sau 13:00, hoặc Thứ Bảy, Chủ Nhật: mặc định là ngày Thứ Hai kế tiếp.
•	Nếu hôm nay và sau 13:00: mặc định là ngày mai.
•	Nếu hôm nay và trước 8:00: mặc định là hôm nay.
•	minDate: Ngày tối thiểu có thể chọn là ngày mặc định được tính bởi calculateDefaultValues (set giờ 00:00:00).
•	onSelect: Cập nhật formData.transaction_date (đối tượng Date).
3.4. Cảnh báo và Thông báo
•	Cảnh báo giờ hạn chế (isRestrictedTime):
•	Hiển thị Alert với AlertCircle màu cam nếu isRestrictedTime là true và currentUser.role !== 'admin'.
•	isRestrictedTime được tính dựa trên giờ GMT+7: từ 07:45-08:05 (465-485 phút từ 00:00 GMT+7) và 12:45-13:05 (765-785 phút).
•	Thông báo chung (message):
•	Alert hiển thị message.text và message.type.
•	type="success" (xanh lá, CheckCircle) hoặc type="error" (đỏ, AlertCircle).
•	Thông báo thành công sẽ tự động biến mất sau 4 giây.
3.5. Nút bấm và Logic gửi Form
•	isFormValid (useMemo): Kiểm tra tính hợp lệ của toàn bộ form trước khi cho phép gửi.
•	Các trường cơ bản (room, transaction_date, parts_day, transaction_type) phải có giá trị.
•	Trường note phải hợp lệ (nếu hiển thị).
•	ít nhất 1 mã tài sản phải được nhập và tất cả mã phải hợp lệ.
•	handleOpenConfirm (Submit Handler):
•	Ngăn chặn gửi form trực tiếp.
•	Kiểm tra isRestrictedTime (trừ admin). Nếu bị hạn chế, hiển thị lỗi.
•	Chạy validateAllAssets (kiểm tra tất cả mã tài sản và hiển thị lỗi nếu có).
•	Nếu hợp lệ, mở Dialog xác nhận (isConfirmOpen).
•	Dialog Xác nhận (isConfirmOpen):
•	Hiển thị toàn bộ thông tin đã nhập: Phòng, Buổi, Ngày, Loại, Ghi chú, và danh sách Mã TS.
•	Nút "Hủy" và "Xác nhận & Gửi".
•	performSubmit (Logic gửi dữ liệu sau xác nhận):
•	Set isConfirmOpen = false, isLoading = true.
•	Tạo AssetTransaction records:
•	Lặp qua multipleAssets (chỉ lấy các mã không rỗng).
•	Với mỗi mã, phân tích thành asset_code, asset_year.
•	Tạo object transaction bao gồm formData và các thông tin khác (staff_code, notified_at là ISO string UTC).
•	Nếu note không cần thiết (!requiresNoteDropdown && formData.room !== 'QLN'), xóa trường note khỏi object.
•	AssetTransaction.bulkCreate(transactions) để lưu vào database.
•	Gửi thông báo in-app (thay cho email):
•	Tìm tất cả Staff có role: 'admin'.
•	Với mỗi admin, gọi sendNotification (title, message chi tiết giao dịch, recipient_username của admin, notification_type: 'asset_reminder', relatedData).
•	Gửi sendNotification tương tự cho currentUser.
•	window.dispatchEvent(new CustomEvent('notifications:refresh')) để làm mới chuông thông báo.
•	Cập nhật EmailUser: Tìm EmailUser của currentUser, cập nhật last_notification_sent (và last_email_sent) bằng thời gian GMT+7 hiện tại.
•	Cập nhật UI:
•	Dispatch asset:submitted event để MyTodaySubmissions tự động làm mới.
•	Hiển thị thông báo thành công.
•	Reset form về trạng thái mặc định (gọi calculateDefaultValues).
•	Clear multipleAssets về [""].
•	Set isLoading = false.
•	Nút "Clear": Xóa form và reset về giá trị mặc định.
3.6. Footer dính (Sticky Footer - Mobile)
•	Trên mobile, một thanh footer dính (fixed bottom-4) chứa nút "Clear" và "Gửi thông báo".
•	Hiển thị thông báo "Khung giờ nghỉ • Vui lòng nhắn Zalo" khi isRestrictedTime là true cho user thường.
3.7. Phần "Thông báo đã gửi của tôi" (MyTodaySubmissions)
•	Khung Collapsible:
•	Sử dụng nút button với onClick để chuyển đổi state isSectionOpen.
•	Mặc định isSectionOpen là false (đóng).
•	Icon ChevronUp khi mở, ChevronDown khi đóng.
•	Logic Lazy Load và Conditionally Render:
•	MyTodaySubmissions được React.lazy load.
•	Chỉ render khi isSectionOpen là true.
•	Sử dụng Suspense với fallback={<MyTodaySubmissionsSkeleton />} để hiển thị trạng thái tải.
•	Bên trong MyTodaySubmissions (khi mở):
•	State: selfTransactions (giao dịch của người dùng hiện tại), isLoading.
•	gmt7TodayStr: Ngày hiện tại theo GMT+7 (yyyy-MM-dd).
•	loadForDate(dateStr):
•	Lọc AssetTransaction của currentUser.username (không xóa mềm).
•	Sử dụng fetchWithCache để tối ưu (cache 1 phút). Giới hạn số lượng bản ghi tải về (limit: 600) để tăng tốc.
•	Logic lọc: Lấy các giao dịch mà notified_at (hoặc created_date) nằm trong dateStr (theo GMT+7), VÀ transaction_date không được trong quá khứ so với gmt7TodayStr.
•	determineAnchorAndLoad(bypassCache): Logic tải dữ liệu chính.
•	Ưu tiên tải dữ liệu hôm nay (gmt7TodayStr).
•	Nếu không có, kiểm tra localStorage cho ngày "neo" trước đó (mySubmissionsAnchor).
•	Tải dữ liệu cho ngày "neo" đó. Nếu không có, xóa "neo".
•	useEffect lắng nghe asset:submitted: Khi có event này, gọi determineAnchorAndLoad(true) để bỏ qua cache và tải lại dữ liệu mới nhất.
•	canActOnTransaction(t): Xác định quyền chỉnh sửa/xóa từng hàng.
•	Phải là giao dịch của currentUser.
•	Không trong isRestrictedNow() (giờ hạn chế).
•	transaction_date phải là hôm nay hoặc tương lai (theo GMT+7).
•	Chỉnh sửa (handleEdit):
•	Chỉ cho phép nếu canActOnTransaction là true.
•	Mở Dialog chỉnh sửa. Các trường tương tự form gốc.
•	handleUpdate sẽ ghi lại change_logs.
•	Xóa (handleDelete):
•	Chỉ cho phép nếu canActOnTransaction là true.
•	Hỏi xác nhận.
•	Thực hiện "xóa mềm" (is_deleted: true, deleted_at, deleted_by) và ghi lại vào change_logs.
•	Hiển thị: Sử dụng ReportTable để hiển thị danh sách giao dịch.
3.8. Liên kết "Báo lỗi ứng dụng"
•	Một Link dẫn đến trang AppErrorReport (createPageUrl('AppErrorReport')) với icon Bug.
________________________________________
4. Luồng thực hiện (Workflow)
1.	Người dùng truy cập trang AssetEntry:
•	Layout kiểm tra loggedInStaff trong localStorage. Nếu không có hoặc có lỗi, chuyển hướng đến SignIn.
•	Layout bắt đầu với notificationsEnabled = false.
•	Khi AssetEntry mount, calculateDefaultValues được gọi để đặt các giá trị mặc định cho form (transaction_date, parts_day, room, note).
•	Sau render ban đầu, AssetEntry phát ra event asset-entry:ready.
•	Layout nhận event này và đặt notificationsEnabled = true, cho phép NotificationBell và NotificationProvider hoạt động và tải dữ liệu.
2.	Người dùng nhập liệu:
•	Điền thông tin vào các trường (Phòng, Mã TS, Loại tác nghiệp, Ngày/Buổi).
•	Có thể dùng AI Camera để scan mã TS từ hình ảnh.
•	Hệ thống hiển thị cảnh báo nếu đang trong giờ hạn chế.
3.	Người dùng nhấn "Gửi thông báo":
•	handleOpenConfirm được gọi.
•	Form được validate toàn bộ.
•	Nếu hợp lệ, một Dialog xác nhận sẽ xuất hiện, hiển thị lại toàn bộ thông tin đã nhập.
4.	Người dùng nhấn "Xác nhận & Gửi" trong Dialog:
•	performSubmit được gọi.
•	Dữ liệu được tạo thành các bản ghi AssetTransaction và lưu vào database bằng bulkCreate.
•	Các thông báo in-app được gửi đến admin và người dùng.
•	Trạng thái EmailUser được cập nhật.
•	Form được reset.
•	Event asset:submitted được phát ra.
5.	Theo dõi giao dịch đã gửi:
•	Người dùng có thể bấm vào khung "Thông báo đã gửi của tôi" để mở ra.
•	Khi mở, component MyTodaySubmissions được mount, tải dữ liệu và hiển thị các giao dịch đã gửi của người dùng trong ngày (hoặc ngày "neo" đã lưu).
•	MyTodaySubmissions lắng nghe asset:submitted và tự động làm mới khi có giao dịch mới được gửi.
•	Người dùng có thể chỉnh sửa hoặc xóa mềm các giao dịch của mình nếu thỏa mãn điều kiện (canActOnTransaction).
________________________________________
5. Các điểm tối ưu hóa tải trang/hiển thị
•	Deferred Notifications: NotificationProvider và NotificationBell chỉ bắt đầu tải dữ liệu/hiển thị sau khi AssetEntry đã load hoàn tất (qua event asset-entry:ready).
•	Collapsible MyTodaySubmissions: MyTodaySubmissions được React.lazy load và chỉ được mount/render khi người dùng chủ động mở khung dropdown "Thông báo đã gửi của tôi". Điều này giúp giảm tải ban đầu đáng kể.
•	MyTodaySubmissionsSkeleton: Cung cấp trải nghiệm tốt hơn khi MyTodaySubmissions đang tải.
•	fetchWithCache: Được sử dụng rộng rãi để giảm số lượng API calls và tăng tốc độ phản hồi.
•	Giới hạn dữ liệu tải: MyTodaySubmissions chỉ tải 600 bản ghi gần nhất của người dùng để tránh tải quá nhiều dữ liệu không cần thiết.
•	isSafari check và prefetch: Layout tránh prefetch DailyReport trên Safari/iPhone để giảm tải ban đầu, vì các thiết bị này nhạy cảm hơn với việc tải không cần thiết.
•	Xóa Tailwind CDN và ẩn cảnh báo: Layout chủ động xóa script CDN Tailwind nếu có và ẩn cảnh báo liên quan, đảm bảo không có tài nguyên hoặc thông báo không mong muốn gây ảnh hưởng hiệu suất hoặc làm phiền console.
•	ErrorBoundary: Toàn bộ ứng dụng được bọc trong ErrorBoundary để ngăn chặn lỗi làm trắng màn hình hoàn toàn, đặc biệt hữu ích trên các thiết bị iOS nơi các lỗi có thể nghiêm trọng hơn.
________________________________________
Với mô tả chi tiết này, AI sẽ có thể tái tạo chính xác trang "AssetEntry", bao gồm cả hành vi trên các thiết bị như iPhone.
2 days ago
Bạn hãy viết thật chi tiết toàn bộ chức năng, logic, cách thực hiện, luồng thực hiện, các loại form, các thiết để, có yếu tố của Database (gồm các thiết kế, schema, ...) của trang "DailyReport" để AI vibe code có thể làm lại chính xác trang "DailyReport" mà không gặp bất kỳ lỗi gì.
2 days ago•
see context
Revert this
Base44
Tuyệt vời! Dưới đây là tài liệu chi tiết về trang "DailyReport" (Danh sách TS cần lấy), bao gồm chức năng, logic, thiết kế database và các tối ưu hóa, để AI có thể tái tạo chính xác mà không gặp bất kỳ lỗi nào.
________________________________________
1. Tổng quan trang "DailyReport"
Trang "DailyReport" cung cấp cái nhìn tổng hợp về các giao dịch tài sản đã được thông báo, tập trung vào những tài sản cần được lấy trong ngày hoặc các khoảng thời gian cụ thể. Trang này hỗ trợ người dùng theo dõi, quản lý và thực hiện các tác vụ cần thiết với tài sản.
•	Mục đích: Hiển thị, tổng hợp, và quản lý các giao dịch tài sản cần được lấy theo ngày.
•	Đối tượng sử dụng: Chủ yếu là nhân viên phòng NQ (currentUser.department === 'NQ'), và các nhân viên khác có thể xem báo cáo của riêng họ hoặc báo cáo chung tùy theo vai trò. Admin có toàn quyền chỉnh sửa/xóa.
•	Các tính năng cốt lõi:
•	Hiển thị danh sách giao dịch tài sản theo nhiều bộ lọc thời gian (Sáng, Chiều, Hôm nay, Ngày kế tiếp, Tùy chỉnh).
•	Tự động gom nhóm các mã tài sản theo Phòng và Năm để dễ theo dõi.
•	Hỗ trợ ghi chú đã duyệt cho phòng NQ.
•	Cho phép đánh dấu tài sản "Đã lấy" (chỉ NQ).
•	Chức năng chỉnh sửa và xóa (mềm) giao dịch (tuân thủ giới hạn thời gian và quyền).
•	Tự động làm mới dữ liệu (có thể bật/tắt).
•	Xuất báo cáo dưới dạng PDF.
•	Hiển thị danh sách các giao dịch đã xóa mềm (chỉ admin có thể thao tác).
________________________________________
2. Thiết kế Database (Entities)
Trang "DailyReport" tương tác với các entity sau:
2.1. AssetTransaction (Giao dịch Tài sản)
Entity cốt lõi, chứa các giao dịch được gửi từ trang AssetEntry.
•	Schema (các trường liên quan):
•	id: string
•	created_date: string (ISO datetime string)
•	updated_date: string (ISO datetime string)
•	created_by: string (email người tạo)
•	transaction_date: string (định dạng yyyy-MM-dd, Ngày thực hiện giao dịch)
•	parts_day: string (enum: "Sáng", "Chiều")
•	room: string (enum: "QLN", "CMT8", "NS", "ĐS", "LĐH", "DVKH")
•	transaction_type: string (enum: "Xuất kho", "Mượn TS", "Thay bìa")
•	asset_year: integer (Năm của tài sản, từ 20-99)
•	asset_code: integer (Mã số của tài sản)
•	staff_code: string (Mã nhân viên thực hiện giao dịch)
•	note: string (Ghi chú)
•	notified_at: string (ISO datetime string, thời gian người dùng nhắn, dùng để tính "Time nhắn")
•	is_deleted: boolean (default: false, đánh dấu xóa mềm)
•	deleted_at: string (ISO datetime string, thời điểm xóa mềm)
•	deleted_by: string (username người xóa)
•	change_logs: array (Lưu trữ lịch sử thay đổi của giao dịch, bao gồm thay đổi trường và xóa mềm)
2.2. ProcessedNote (Ghi chú đã xử lý)
Entity để phòng NQ ghi lại các ghi chú đã duyệt, hiển thị cùng với các tài sản gom nhóm.
•	Schema:
•	id: string
•	created_date: string (ISO datetime string)
•	updated_date: string (ISO datetime string)
•	created_by: string (email người tạo)
•	room: string (enum: "QLN", "CMT8", "NS", "ĐS", "LĐH", "NQ", Phòng ban liên quan đến ghi chú)
•	operation_type: string (enum: "Hoàn trả", "Xuất kho", "Nhập kho", "Xuất mượn", "Thiếu CT", "Khác", Loại tác nghiệp của ghi chú)
•	content: string (Nội dung ghi chú)
•	staff_code: string (Mã nhân viên tạo ghi chú)
•	is_done: boolean (default: false, đánh dấu đã xử lý xong)
•	done_at: string (ISO datetime string, thời gian đánh dấu hoàn thành)
•	mail_to_nv: string (Tên nhân viên nhận email, dùng để gợi ý và gửi mail)
2.3. TakenAssetStatus (Trạng thái TS đã lấy)
Entity để phòng NQ đánh dấu các tài sản đã được lấy, nhằm tránh trùng lặp hoặc nhầm lẫn.
•	Schema:
•	id: string
•	created_date: string (ISO datetime string)
•	updated_date: string (ISO datetime string)
•	created_by: string (email người tạo)
•	transaction_id: string (ID của AssetTransaction được đánh dấu)
•	user_username: string (Username của người đã đánh dấu)
•	week_year: string (Tuần và năm theo format 'YYYY-WW', ví dụ: '2024-52')
•	marked_at: string (ISO datetime string, thời gian đánh dấu)
2.4. Các Entity Staff liên quan (CBQLN, CBKH, v.v.)
Dùng để tải danh sách gợi ý cho tính năng "Mail đến NV" trong ghi chú.
•	Schema (chung):
•	ten_nv: string (Tên nhân viên)
•	email: string (Email nhân viên, không bao gồm domain, ví dụ: 'abc.hvu')
________________________________________
3. Thiết kế UI/Components và Logic
Trang DailyReport được xây dựng bằng React, Shadcn/ui, Tailwind CSS và tận dụng các helper từ @/components/utils/time.
3.1. Header và thanh điều khiển
•	Tiêu đề: "Danh sách TS cần lấy" (h1).
•	Thông tin tuần: Hiển thị "Tuần [số tuần] - [năm] ([ngày bắt đầu] - [ngày kết thúc])".
•	Thời gian cập nhật: "Cập nhật: HH:mm:ss" (lastRefreshTime).
•	Các nút điều khiển:
•	Toggle Auto Refresh: Switch để bật/tắt chức năng tự động làm mới dữ liệu mỗi 60 giây. Trạng thái được lưu trong localStorage.
•	Refresh thủ công: Nút RefreshCw để tải lại dữ liệu tức thì (có animation spin khi loading).
•	Xuất PDF: Nút Download để xuất báo cáo ra PDF (sử dụng window.print()).
•	Toggle Gom nhóm: Nút ListTree để chuyển đổi giữa chế độ hiển thị gom nhóm (showGrouped) và danh sách chi tiết.
•	Bộ lọc Mobile: MobileFilterSheet (Sheet pop-up từ dưới lên) chứa các tùy chọn bộ lọc cho thiết bị di động.
3.2. Bộ lọc (Filters)
Có hai loại bộ lọc: Bộ lọc nhanh (RadioGroup) và Bộ lọc tùy chỉnh (Custom Date Range).
•	filterType (state): Lưu loại bộ lọc hiện tại. Mặc định khởi tạo theo giờ trong ngày (GMT+7).
•	Nếu sau 8:11 AM và trước 1:10 PM: mặc định là 'afternoon'.
•	Ngược lại: mặc định là 'qln_pgd_next_day'.
•	hasInitializedFilter useRef: Đảm bảo chỉ đặt filterType mặc định một lần duy nhất khi tải trang.
•	customFilters (state): Đối tượng lưu trữ start, end (dạng yyyy-MM-dd) và parts_day cho bộ lọc tùy chỉnh.
•	headerDateDisplay (useMemo): Hiển thị mô tả ngày/thời gian cho báo cáo dựa trên filterType đang chọn.
•	Các tùy chọn bộ lọc nhanh (RadioGroup):
•	Sáng ngày (morning): Giao dịch có transaction_date là ngày làm việc kế tiếp (nếu sau 8:05 AM hôm nay) và parts_day là "Sáng".
•	QLN Sáng & PGD trong ngày (qln_pgd_next_day): Giao dịch có transaction_date là ngày làm việc kế tiếp (nếu sau 8:05 AM hôm nay) và parts_day là "Sáng", HOẶC các phòng PGD (CMT8, NS, ĐS, LĐH) có parts_day là "Chiều" trong ngày đó.
•	Chiều ngày (afternoon): Giao dịch có transaction_date là hôm nay và parts_day là "Chiều".
•	Trong ngày hôm nay (today): Giao dịch có transaction_date là hôm nay.
•	Trong ngày kế tiếp (next_day): Giao dịch có transaction_date là ngày làm việc kế tiếp.
•	Tùy chọn khoảng thời gian (custom): Cho phép chọn ngày bắt đầu, ngày kết thúc và Buổi (Sáng, Chiều, Tất cả).
3.3. Phần "Gom nhóm theo Phòng" (showGrouped)
•	Chỉ hiển thị khi showGrouped là true.
•	Logic gom nhóm (groupedRows useMemo):
1.	Lọc allTransactions theo filterType và customFilters (tương tự filteredTransactions bên dưới).
2.	Loại bỏ các giao dịch đã xóa mềm (is_deleted = true).
3.	Loại bỏ các giao dịch đã đánh dấu "Đã lấy" (takenTransactionIds).
4.	Nhóm các giao dịch còn lại theo room, sau đó theo asset_year.
5.	Sắp xếp các phòng theo thứ tự ưu tiên: QLN, CMT8, NS, ĐS, LĐH, DVKH.
6.	Trong mỗi nhóm phòng-năm, gom các asset_code thành một chuỗi.
7.	Đánh dấu tài sản trùng (*): Nếu một tài sản (room-asset_year-asset_code) xuất hiện nhiều hơn một lần trong tuần hiện tại (dựa trên startOfCurrentWeek, endOfCurrentWeek), thì mã tài sản đó được thêm dấu * (ví dụ: 259*).
8.	Thêm ghi chú đã xử lý: Các bản ghi từ processedNotes cũng được đưa vào danh sách này, hiển thị như một dòng riêng biệt, chiếm toàn bộ chiều rộng.
•	Bảng hiển thị: Table với các cột: Phòng, Năm, Danh sách Mã TS, Thao tác.
•	Chức năng cho phòng NQ (canManageDailyReport):
•	Thêm ghi chú (Plus icon): Mở Dialog "Thêm ghi chú đã duyệt".
•	Form bao gồm: Phòng (Select), Loại tác nghiệp (Select), Nội dung (Textarea, BẮT BUỘC), Mail đến NV (AutoCompleteInput, tùy chọn).
•	AutoCompleteInput cho "Mail đến NV" sử dụng danh sách allStaff được tải từ các entity CBQLN, CBKH, v.v.
•	Sau khi lưu, ProcessedNote.create và có thể SendEmail đến nhân viên được chọn (qua email .hvu@vietcombank.com.vn).
•	cacheManager.delete('processed_notes_daily') và loadProcessedNotes() để làm mới.
•	Thao tác ghi chú: Edit, Trash2 (xóa), CheckCircle (đánh dấu đã xong) cho mỗi ghi chú.
•	handleEditNote: Mở Dialog "Chỉnh sửa ghi chú" tương tự form thêm mới. handleUpdateNote sẽ lưu thay đổi.
•	handleDeleteNote: Xóa vĩnh viễn ghi chú (ProcessedNote.delete).
•	handleNoteDone: Cập nhật is_done = true và done_at cho ghi chú.
3.4. Phần "Danh sách tài sản cần lấy" (List View)
•	filteredTransactions (useMemo): Danh sách chi tiết các giao dịch.
1.	Lấy tất cả AssetTransaction từ allTransactions.
2.	Lọc theo filterType và customFilters (logic tương tự groupedRows).
3.	Loại bỏ các giao dịch đã xóa mềm (is_deleted = true).
4.	Sắp xếp (orderBy) theo Phòng, Năm TS, Mã TS.
•	paginatedTransactions (useMemo): Phân trang filteredTransactions (30 mục/trang).
•	Bảng hiển thị (Desktop): ReportTable với các cột chi tiết.
•	Danh sách thẻ (Mobile): TransactionCardList hiển thị dưới dạng thẻ cho mobile.
•	Các chức năng trong danh sách:
•	Check "Đã lấy" (showTakenCheckbox): Chỉ hiển thị cho phòng NQ (canSeeTakenColumn).
•	takenTransactionIds: Set các ID giao dịch đã đánh dấu.
•	handleToggleTakenStatus: Thêm/xóa transaction_id vào TakenAssetStatus với user_username và week_year hiện tại.
•	Chỉnh sửa (Edit icon): Mở Dialog "Chỉnh sửa giao dịch".
•	handleEditTransaction: Cho phép chỉnh sửa các trường của AssetTransaction.
•	canActOnTransaction(t):
•	Admin có thể chỉnh sửa/xóa mọi giao dịch.
•	Người dùng thông thường chỉ có thể chỉnh sửa/xóa giao dịch của chính mình (staff_code) và không trong giờ hạn chế (isRestrictedNow()), và transaction_date phải là hôm nay hoặc tương lai (theo GMT+7).
•	handleUpdateTransaction: Lưu thay đổi và ghi change_logs.
•	Xóa (Trash2 icon):
•	handleDeleteTransaction:
•	Nếu isAdmin và giao dịch đã is_deleted: Thực hiện xóa cứng (AssetTransaction.delete).
•	Ngược lại (user thường hoặc admin xóa giao dịch chưa is_deleted): Thực hiện xóa mềm (is_deleted = true, deleted_at, deleted_by) và ghi change_logs.
3.5. Phần "Danh sách tài sản đã xóa" (Admin only)
•	Chỉ hiển thị khi filteredDeletedTransactions.length > 0.
•	filteredDeletedTransactions (useMemo): Lọc các giao dịch có is_deleted = true theo cùng bộ lọc thời gian đang áp dụng.
•	Bảng/Thẻ hiển thị: Tương tự như danh sách chính.
•	Quyền thao tác: rowActionGuard={() => isAdmin}. Chỉ admin mới có thể chỉnh sửa/xóa (cứng) các mục trong danh sách này.
3.6. Phân trang (Pagination)
•	Hiển thị dưới danh sách chi tiết nếu có nhiều hơn 30 bản ghi.
3.7. Các tiện ích thời gian (@/components/utils/time)
•	toHcmDate(input): Chuyển đổi một ngày/chuỗi sang đối tượng Date đã điều chỉnh sang múi giờ GMT+7.
•	formatHcmHM(input): Định dạng giờ:phút theo GMT+7.
•	formatHcmDDMMYYYY(input): Định dạng ngày/tháng/năm theo GMT+7 (dd/MM/yyyy).
•	formatHcmTimeNhan(input): Định dạng "HH:mm - dd/MM" theo GMT+7.
•	hcmYMD(input): Trả về chuỗi yyyy-MM-dd theo GMT+7.
•	hcmTodayYMD(): Trả về chuỗi yyyy-MM-dd của hôm nay theo GMT+7.
•	getNextWorkingDay(date): Tính ngày làm việc kế tiếp.
•	getMorningTargetDate(): Tính ngày mục tiêu cho các bộ lọc "Sáng" và "QLN Sáng & PGD".
•	isRestrictedNow(): Kiểm tra xem có đang trong khung giờ hạn chế nhập liệu hay không.
________________________________________
4. Luồng thực hiện (Workflow)
1.	Truy cập trang:
•	Layout xác thực loggedInStaff. Nếu không phải admin hoặc user có quyền, chuyển hướng về AssetEntry.
•	DailyReport bắt đầu tải currentUser và autoRefresh từ localStorage.
•	Hàm loadAllTransactions được gọi (defer bằng requestIdleCallback/setTimeout) để tải các giao dịch trong phạm vi ngày hiện tại và ngày làm việc kế tiếp.
•	loadProcessedNotes (nếu canManageDailyReport) và loadTakenStatus (nếu canSeeTakenColumn) được gọi.
2.	Khởi tạo bộ lọc:
•	filterType được đặt mặc định dựa trên giờ trong ngày (GMT+7).
3.	Tự động làm mới (nếu autoRefresh bật):
•	Mỗi 60 giây, backgroundRefresh được gọi để tải lại dữ liệu (AssetTransaction, ProcessedNote, TakenAssetStatus) từ API, so sánh với state hiện tại và cập nhật nếu có thay đổi. Thao tác này được throttling và không chạy khi tab bị ẩn.
4.	Hiển thị dữ liệu:
•	groupedRows và filteredTransactions (và filteredDeletedTransactions) được tính toán dựa trên allTransactions, processedNotes, takenTransactionIds và các bộ lọc đang áp dụng.
•	Dữ liệu được hiển thị trong Card gom nhóm và Card chi tiết.
•	Nếu showGrouped bật, groupedRows sẽ hiển thị trong Table.
•	paginatedTransactions hiển thị trong ReportTable (desktop) hoặc TransactionCardList (mobile).
5.	Tương tác người dùng:
•	Thay đổi bộ lọc: filterType hoặc customFilters thay đổi sẽ tính toán lại groupedRows và filteredTransactions.
•	Thao tác ghi chú (chỉ NQ): Thêm, chỉnh sửa, xóa, đánh dấu đã xong ghi chú.
•	Đánh dấu "Đã lấy" (chỉ NQ): Checkbox trong bảng/thẻ để ghi nhận TakenAssetStatus.
•	Chỉnh sửa/Xóa giao dịch: Dựa trên canActOnTransaction, người dùng có thể mở form chỉnh sửa hoặc xóa mềm giao dịch. Admin có thể xóa cứng giao dịch đã xóa mềm.
•	Phân trang: Chuyển đổi giữa các trang dữ liệu.
•	Xuất PDF: In nội dung trang (ẩn các phần UI không liên quan).
________________________________________
5. Các điểm tối ưu hóa tải trang/hiển thị
•	Lazy Loading và requestIdleCallback:
•	loadAllTransactions được gọi trong requestIdleCallback (hoặc setTimeout fallback) để trì hoãn việc tải dữ liệu nặng, tránh chặn luồng chính và cải thiện First Contentful Paint (FCP).
•	Background Refresh (Throttled & Visibility-aware):
•	backgroundRefresh sử dụng setInterval nhưng chỉ chạy khi tab hiển thị (không document.hidden) và có kiểm tra isFetchingData để tránh các cuộc gọi API không cần thiết.
•	fetchWithCache: Được sử dụng rộng rãi cho tất cả các cuộc gọi API (AssetTransaction, ProcessedNote, TakenAssetStatus, Staff) với TTL (Time-To-Live) phù hợp để giảm tải server và tăng tốc độ tải.
•	Cache cho AssetTransaction được quản lý với khóa cache daily_report_transactions_scoped_v2_... để phân biệt theo phạm vi ngày.
•	Cache cho TakenAssetStatus được phân biệt theo user_username và week_year.
•	Tải dữ liệu có điều kiện:
•	loadProcessedNotes chỉ chạy khi canManageDailyReport là true và showGrouped hoặc isNotesDialogOpen là true.
•	loadTakenStatus chỉ chạy khi canSeeTakenColumn và currentUser?.username có giá trị.
•	Tối ưu render: useMemo được dùng để cache kết quả của các hàm lọc, gom nhóm, sắp xếp và phân trang, chỉ tính toán lại khi dependencies thay đổi.
•	Tối ưu UI cho Mobile: Sử dụng TransactionCardList và MobileFilterSheet để mang lại trải nghiệm tốt trên thiết bị di động.
•	Scroll to Main Content (Mobile): Tự động cuộn xuống phần chính của báo cáo khi tải trang trên mobile để người dùng dễ nhìn thấy dữ liệu.
====
Dưới đây là tài liệu chi tiết về chức năng, logic, luồng thực hiện, thiết kế form, các nút và schema database của các trang "SignIn", "AssetEntry", và "DailyReport". Tài liệu này được biên soạn để AI có thể hiểu rõ và tái tạo chính xác các trang trên một cách tối ưu cho hệ thống frontend React + Vite + TypeScript chạy trên Vercel và backend Supabase.
________________________________________
1. Trang "SignIn" (Đăng nhập)
1.1. Tổng quan trang "SignIn"
Trang "SignIn" là cổng vào ứng dụng, nơi người dùng cung cấp thông tin đăng nhập để truy cập các tính năng. Trang này tích hợp logic kiểm tra tài khoản bị khóa và giới hạn số lần thử đăng nhập để tăng cường bảo mật.
•	Mục đích: Xác thực người dùng và cấp quyền truy cập vào ứng dụng.
•	Đối tượng sử dụng: Tất cả nhân viên của hệ thống.
•	Các tính năng cốt lõi:
•	Nhập tên đăng nhập và mật khẩu.
•	Kiểm tra tài khoản bị khóa trước và sau khi nhập mật khẩu.
•	Theo dõi số lần đăng nhập sai và tự động khóa tài khoản sau 3 lần.
•	Hiển thị thông báo lỗi rõ ràng.
•	Chuyển hướng người dùng đến trang phù hợp sau khi đăng nhập thành công.
•	Liên kết đến trang "ResetPassword" để đặt lại mật khẩu.
1.2. Thiết kế Database (Entities) cho "SignIn"
Trang "SignIn" tương tác chủ yếu với entity Staff.
Staff (Nhân viên)
•	Schema:
•	id: string (UUID, khóa chính, tự động tạo)
•	created_date: string (ISO datetime string, tự động tạo khi record được tạo)
•	updated_date: string (ISO datetime string, tự động cập nhật khi record thay đổi)
•	created_by: string (email của người tạo record)
•	username: string (Mã nhân viên, DUY NHẤT, BẮT BUỘC, dùng làm tên đăng nhập)
•	password: string (Mật khẩu, BẮT BUỘC, lưu trữ dưới dạng plaintext hoặc hash nếu có cơ chế hash phía server)
•	staff_name: string (Tên hiển thị của nhân viên, BẮT BUỘC)
•	email: string (Địa chỉ email công việc, ví dụ: ten.nv.hvu@vietcombank.com.vn)
•	role: string (enum: "admin", "user", default: "user", phân quyền người dùng)
•	department: string (Phòng ban của nhân viên, ví dụ: "NQ", "QLN", "CMT8", "DVKH")
•	account_status: string (enum: "active", "locked", default: "active", trạng thái tài khoản)
•	failed_login_attempts: integer (default: 0, số lần đăng nhập sai liên tiếp)
•	last_failed_login: string (ISO datetime string, thời điểm đăng nhập sai cuối cùng)
•	locked_at: string (ISO datetime string, thời điểm tài khoản bị khóa)
•	Liên quan đến trang này:
•	Dùng để truy vấn thông tin username, password để xác thực.
•	Cập nhật failed_login_attempts, last_failed_login, account_status, locked_at khi đăng nhập thất bại hoặc thành công.
•	Lấy role và department để quyết định trang chuyển hướng sau đăng nhập.
1.3. Thiết kế UI/Components và Logic cho "SignIn"
•	Layout: Centered content trong min-h-screen, max-w-md Card.
•	Card: Card từ Shadcn/ui với border-0, shadow-2xl.
•	CardHeader: Tiêu đề "Đăng nhập" và mô tả "Truy cập hệ thống quản lý tài sản kho".
•	CardContent: Chứa form đăng nhập và các thông báo.
•	Input Fields (Shadcn/ui Input):
•	Tên đăng nhập (username): type="text", placeholder="Nhập tên đăng nhập". Icon UserIcon. required.
•	Mật khẩu (password): type="password", placeholder="Nhập mật khẩu". Icon Lock. required.
•	Buttons (Shadcn/ui Button):
•	"Đăng nhập" (type="submit"): Background gradient xanh, isLoading state. Disabled khi isLoading hoặc isAccountLocked.
•	"Thử tài khoản khác" (type="button", variant="outline"): Chỉ hiển thị khi tài khoản bị khóa, cho phép xóa trạng thái lỗi và thử lại.
•	"Reset mật khẩu": Link đến trang createPageUrl('ResetPassword').
•	Thông báo (Alert):
•	Hiển thị thông báo lỗi (Alert variant="destructive") hoặc cảnh báo (AlertCircle) nếu có lỗi (ví dụ: "Tên đăng nhập hoặc mật khẩu không đúng", "Tài khoản của bạn đã bị khóa").
•	State:
•	credentials: { username: "", password: "" }
•	error: string
•	isLoading: boolean
•	isAccountLocked: boolean
•	showForm: boolean (để ẩn form khi tài khoản bị khóa)
3.1. Header và Banner
•	Logo & Tiêu đề: Icon Package trong hình tròn gradient, h1 "Đăng nhập", p "Truy cập hệ thống quản lý tài sản kho".
3.2. Form đăng nhập (<form>)
•	Logic kiểm tra trạng thái tài khoản (useEffect):
•	Khi credentials.username thay đổi, sau 500ms, gửi request đến Staff.list() để kiểm tra account_status của username đó.
•	Nếu account_status === 'locked', đặt isAccountLocked=true, showForm=false, hiển thị lỗi "Tài khoản của bạn đã bị khóa...".
•	Nếu không, đặt lại isAccountLocked=false, showForm=true.
•	Logic handleSubmit:
1.	Đặt isLoading = true, xóa error cũ.
2.	Kiểm tra isAccountLocked. Nếu true, hiển thị lỗi và dừng.
3.	Lấy tất cả Staff records. Tìm staff khớp với username (không phân biệt hoa thường).
4.	Nếu không tìm thấy staff: Hiển thị lỗi "Tên đăng nhập hoặc mật khẩu không đúng".
5.	Nếu tìm thấy staff:
•	Kiểm tra account_status: Nếu locked, hiển thị lỗi và khóa form.
•	Kiểm tra mật khẩu:
•	Nếu đúng:
•	Nếu failed_login_attempts > 0, cập nhật Staff.update(staff.id, { failed_login_attempts: 0, last_failed_login: null }).
•	Lưu staff vào localStorage dưới khóa loggedInStaff.
•	Chuyển hướng: Nếu staff.department === "NQ", chuyển hướng đến createPageUrl("DailyReport"). Ngược lại, chuyển hướng đến createPageUrl("AssetEntry").
•	Nếu sai:
•	Tăng failed_login_attempts.
•	Cập nhật last_failed_login.
•	Nếu failed_login_attempts >= 3:
•	Cập nhật account_status = 'locked', locked_at = now.
•	Hiển thị lỗi "Tài khoản đã bị khóa do nhập sai mật khẩu 3 lần...".
•	Đặt isAccountLocked=true, showForm=false.
•	Ngược lại: Hiển thị lỗi "Mật khẩu không đúng. Còn [số lần] lần thử...".
6.	Đặt isLoading = false.
1.4. Luồng thực hiện (Workflow) "SignIn"
1.	Người dùng truy cập trang /SignIn.
2.	Trang tải, hiển thị form đăng nhập.
3.	Người dùng nhập "Tên đăng nhập". Sau một khoảng trễ ngắn, hệ thống kiểm tra trạng thái tài khoản.
4.	Nếu tài khoản không bị khóa, người dùng nhập "Mật khẩu".
5.	Người dùng nhấn nút "Đăng nhập".
6.	Hệ thống xác thực thông tin.
7.	Nếu thành công, thông tin staff được lưu vào localStorage, và người dùng được chuyển hướng đến trang báo cáo hoặc trang nhập tài sản.
8.	Nếu thất bại, thông báo lỗi được hiển thị, và số lần thử đăng nhập sai được ghi nhận. Nếu vượt quá 3 lần, tài khoản bị khóa.
9.	Nếu tài khoản bị khóa, form đăng nhập bị ẩn, và nút "Thử tài khoản khác" xuất hiện.
________________________________________
2. Trang "AssetEntry" (Thông báo Mượn/Xuất)
2.1. Tổng quan trang "AssetEntry"
Trang "AssetEntry" là giao diện chính cho phép nhân viên nhanh chóng ghi nhận các giao dịch liên quan đến tài sản như mượn, xuất kho, hoặc thay bìa. Nó được thiết kế để dễ sử dụng, với các giá trị mặc định thông minh, hỗ trợ nhập liệu nhiều dòng, và tích hợp AI để đọc mã tài sản từ hình ảnh.
•	Mục đích: Ghi nhận các giao dịch tài sản vào hệ thống một cách hiệu quả.
•	Đối tượng sử dụng: Toàn bộ nhân viên, bao gồm cả người dùng thông thường và quản trị viên.
•	Các tính năng cốt lõi:
•	Nhập liệu form: Các trường thông tin giao dịch (phòng, loại tác nghiệp, ngày, buổi, ghi chú, mã tài sản).
•	Giá trị mặc định thông minh: Tự động điền phòng ban, buổi, ngày dựa trên thông tin nhân viên và thời gian hiện tại.
•	Hỗ trợ nhập nhiều mã tài sản: Thêm/bớt các dòng nhập mã tài sản.
•	Xác thực định dạng mã tài sản: Kiểm tra [Mã TS].[Năm TS] theo thời gian thực.
•	Tích hợp AI Camera: Đọc mã tài sản và phát hiện phòng ban từ hình ảnh (qua UploadFile, ExtractDataFromUploadedFile).
•	Giới hạn thời gian nhập liệu: Hạn chế gửi dữ liệu trong các khung giờ nhất định cho người dùng thông thường.
•	Thông báo & Xác nhận: Hiển thị thông báo về kết quả gửi, xác nhận trước khi lưu.
•	Thông báo in-app: Gửi thông báo đến admin và người gửi sau khi giao dịch thành công.
•	"Thông báo đã gửi của tôi": Một phần có thể thu gọn, hiển thị các giao dịch người dùng đã gửi trong ngày.
2.2. Thiết kế Database (Entities) cho "AssetEntry"
Trang "AssetEntry" tương tác với các entity sau:
AssetTransaction (Giao dịch Tài sản)
•	Schema:
•	id: string (UUID, khóa chính)
•	created_date: string (ISO datetime string)
•	updated_date: string (ISO datetime string)
•	created_by: string (email người tạo)
•	transaction_date: string (định dạng yyyy-MM-dd, Ngày thực hiện giao dịch, BẮT BUỘC)
•	parts_day: string (enum: "Sáng", "Chiều", Buổi trong ngày, BẮT BUỘC)
•	room: string (enum: "QLN", "CMT8", "NS", "ĐS", "LĐH", "DVKH", Phòng ban liên quan, BẮT BUỘC)
•	transaction_type: string (enum: "Xuất kho", "Mượn TS", "Thay bìa", Loại hình giao dịch, BẮT BUỘC)
•	asset_year: integer (Năm của tài sản, ví dụ 24 cho 2024, từ 20-99, BẮT BUỘC)
•	asset_code: integer (Mã số của tài sản, BẮT BUỘC)
•	staff_code: string (Mã nhân viên thực hiện giao dịch, lấy từ currentUser.username, BẮT BUỘC)
•	note: string (Ghi chú tùy chọn, ví dụ: "Ship PGD", "Lấy ở CN" hoặc ghi chú cho QLN. Chỉ BẮT BUỘC nếu room là 'CMT8', 'NS', 'ĐS', 'LĐH' và transaction_type không rỗng.)
•	notified_at: string (ISO datetime string, thời gian người dùng nhấn nút gửi (UTC), dùng cho mục đích hiển thị "Time nhắn" ở GMT+7 và lọc "MyTodaySubmissions")
•	is_deleted: boolean (default: false, đánh dấu xóa mềm)
•	deleted_at: string (ISO datetime string, thời điểm xóa mềm)
•	deleted_by: string (username người thực hiện xóa mềm)
•	change_logs: array (Lịch sử thay đổi, mỗi object: time, field, old_value, new_value, edited_by)
•	Liên quan đến trang này: Là đích đến của dữ liệu nhập từ form, được tạo (bulkCreate) khi người dùng gửi thông báo.
Staff (Nhân viên)
•	Schema (các trường liên quan):
•	username: string
•	staff_name: string
•	role: string (admin/user)
•	department: string
•	account_status: string
•	Liên quan đến trang này: Lấy thông tin currentUser (username, staff_name, role, department) từ localStorage để:
•	Điền giá trị mặc định cho form.
•	Kiểm tra quyền hạn (ví dụ: admin không bị giới hạn thời gian).
•	Điền staff_code cho AssetTransaction.
•	Gửi thông báo in-app.
EmailUser (Người dùng Email)
•	Schema (các trường liên quan):
•	username: string
•	email: string
•	full_name: string
•	last_notification_sent: string (ISO datetime string, thời điểm gửi thông báo/nhấn nút gửi gần nhất, GMT+7)
•	last_email_sent: string (ISO datetime string, giữ đồng bộ với last_notification_sent cho mục đích báo cáo)
•	Liên quan đến trang này: Cập nhật thời gian gửi thông báo (last_notification_sent, last_email_sent) cho người dùng hiện tại sau khi gửi thành công.
Notification (Thông báo In-app)
•	Schema (các trường liên quan):
•	title: string
•	message: string
•	recipient_username: string
•	notification_type: string (enum: "asset_reminder", "crc_reminder", "general")
•	is_read: boolean
•	related_data: string (JSON string)
•	Liên quan đến trang này: Được tạo (create) để gửi thông báo đến admin và người gửi (sendNotification).
2.3. Thiết kế UI/Components và Logic cho "AssetEntry"
•	Layout: Responsive max-w-4xl mx-auto, p-4 pb-28 md:p-8 md:pb-8. Sticky footer cho mobile.
•	Card: Card chính để chứa form nhập liệu.
3.1. Header chính
•	Tiêu đề: "Thông báo Mượn/Xuất".
•	Mô tả: Hiển thị thông báo về giờ giới hạn nhập liệu hoặc "Không giới hạn thời gian cho Admin".
•	Icon: Package.
3.2. Form nhập liệu (<form>)
Sử dụng form HTML thông thường với onSubmit liên kết tới handleOpenConfirm.
•	Phòng (room): Select với các tùy chọn "QLN", "CMT8", "NS", "ĐS", "LĐH", "DVKH". Icon Building.
•	Logic mặc định: Lấy currentUser.department. Nếu nằm trong các phòng cho phép, đặt làm mặc định.
•	Logic thay đổi: Khi room thay đổi, parts_day và note (nếu QLN) sẽ tự động cập nhật.
•	Ghi chú (note): Textarea (nếu room === 'QLN') hoặc Select (nếu room thuộc nhóm "CMT8", "NS", "ĐS", "LĐH" với các tùy chọn "Ship PGD", "Lấy ở CN").
•	Logic mặc định: "Ship PGD" (trừ khi room === 'QLN' thì để trống).
•	Mã tài sản (multipleAssets):
•	Một mảng các Input (type="text", inputMode="decimal").
•	Placeholder: "Ví dụ: 259.24".
•	Xác thực isAssetValid: Kiểm tra định dạng ^\d{1,4}\.\d{2}$ và năm 20-99 theo thời gian thực (hiển thị CheckCircle hoặc AlertCircle).
•	Nút Plus: Thêm một dòng nhập mã tài sản mới.
•	Nút Minus: Xóa dòng nhập mã tài sản (chỉ khi có >1 dòng).
•	"Xem thêm/Thu gọn" (ChevronDown/Up): Nút để ẩn/hiện các dòng mã tài sản nếu có hơn 5 dòng.
•	Tích hợp AI Camera: Nút Camera
•	Mở Dialog với 2 nút: "Upload từ thiết bị" (Upload) và "Chụp ảnh" (Camera).
•	Sử dụng input type="file" accept="image/*" ẩn để chọn file/chụp ảnh.
•	processImages: Tải lên file (UploadFile), trích xuất văn bản (ExtractDataFromUploadedFile), tìm kiếm các chuỗi 0424xxxx hoặc 0423xxxx, phân tích mã tài sản và phòng ban.
•	Feedback AI: Hiển thị aiStatus (Loader2) trong quá trình xử lý (uploading, extracting, progress, done, error).
•	Loại tác nghiệp (transaction_type): Select với các tùy chọn "Xuất kho", "Mượn TS", "Thay bìa".
•	Buổi (parts_day): Select với tùy chọn "Sáng", "Chiều".
•	Logic mặc định: getDefaultPartsDay tính toán dựa trên room và giờ GMT+7 hiện tại.
•	Ngày lấy TS (transaction_date): Popover chứa Calendar.
•	Hiển thị: Định dạng dd/MM/yyyy.
•	Logic mặc định: calculateDefaultValues tính toán ngày mặc định:
•	Nếu là cuối tuần hoặc sau 1 PM, chuyển sang ngày làm việc kế tiếp.
•	Nếu sau 1 PM, chuyển sang ngày mai.
•	Nếu trước 8 AM, là hôm nay.
•	minDate: Ngày nhỏ nhất có thể chọn là ngày mặc định (để tránh chọn ngày quá khứ).
3.3. Thông báo chung (Alert)
•	Hiển thị thông báo message.text về kết quả gửi hoặc lỗi (CheckCircle / AlertCircle).
•	Tự động biến mất sau 4 giây nếu là success.
3.4. Các nút hành động chính
•	Mobile Sticky Action Bar: Một thanh div cố định ở cuối màn hình (md:hidden fixed bottom-4).
•	"Clear" (variant="outline"): Xóa form.
•	"Gửi thông báo" (bg-gradient-to-r from-green-600): Nút chính để gửi.
•	Desktop Action Buttons: div hidden md:flex justify-end.
•	"Clear" (variant="outline"): Xóa form.
•	"Gửi thông báo" (bg-gradient-to-r from-green-600): Nút chính để gửi.
•	Điều kiện disabled cho nút "Gửi thông báo": !isFormValid || isLoading || isRestrictedTime (trừ admin).
•	Link "Gặp lỗi? Chụp hình & Click here.": Link đến createPageUrl('AppErrorReport').
3.5. Dialog xác nhận (Confirmation Dialog)
•	handleOpenConfirm: Mở dialog xác nhận trước khi gửi.
•	Nội dung: Tóm tắt các thông tin chính của giao dịch: Phòng, Buổi, Ngày, Loại, Ghi chú, Danh sách Mã TS.
•	Nút "Hủy": Đóng dialog.
•	Nút "Xác nhận & Gửi": Gọi performSubmit.
3.6. Phần "Thông báo đã gửi của tôi" (MyTodaySubmissions)
•	Một phần có thể thu gọn/mở rộng bằng nút ChevronUp/ChevronDown.
•	Suspense và Lazy Load: Component MyTodaySubmissions được lazy-load và chỉ được render khi người dùng click để mở rộng phần này.
•	Nội dung: Hiển thị các giao dịch người dùng đã gửi trong ngày hiện tại, tương tự như một báo cáo chi tiết thu nhỏ.
2.4. Luồng thực hiện (Workflow) "AssetEntry"
1.	Tải trang:
•	Layout tải loggedInStaff. Nếu user không login, chuyển hướng về SignIn.
•	AssetEntry tải currentUser từ localStorage.
•	formData được khởi tạo với các giá trị mặc định (calculateDefaultValues).
•	Kiểm tra isRestrictedTime liên tục (useEffect).
•	Layout chờ 'asset-entry:ready' để kích hoạt notifications.
2.	Nhập liệu:
•	Người dùng nhập thông tin vào form hoặc sử dụng nút AI để nhập từ hình ảnh.
•	Các trường Select tự động gợi ý giá trị dựa trên currentUser.department và thời gian.
•	Các dòng nhập mã tài sản được thêm/xóa linh hoạt.
•	Định dạng mã tài sản được xác thực tức thì.
3.	Sử dụng AI Camera (tùy chọn):
•	Người dùng click nút AI, chọn file ảnh hoặc chụp ảnh.
•	Ảnh được tải lên (UploadFile), sau đó AI đọc nội dung và trích xuất mã tài sản, phòng.
•	Kết quả được điền tự động vào form, bao gồm cả việc thay đổi room và parts_day nếu AI phát hiện.
4.	Xác nhận và Gửi:
•	Người dùng click "Gửi thông báo".
•	Hệ thống kiểm tra isRestrictedTime (trừ admin) và isFormValid.
•	Dialog xác nhận hiển thị tóm tắt thông tin.
•	Người dùng click "Xác nhận & Gửi".
5.	Xử lý submission (performSubmit):
•	Đặt isLoading = true.
•	Tạo mảng các đối tượng giao dịch từ multipleAssets và formData.
•	Gắn staff_code và notified_at.
•	Gọi AssetTransaction.bulkCreate() để lưu vào database.
•	Phát sự kiện asset:submitted để MyTodaySubmissions tự động làm mới.
•	Reset form về trạng thái ban đầu, xóa message.
•	Gửi thông báo in-app: Gọi sendNotification đến các admin và chính người gửi.
•	Cập nhật EmailUser timestamps.
•	Đặt isLoading = false.
6.	Xem các giao dịch đã gửi:
•	Người dùng mở phần "Thông báo đã gửi của tôi".
•	Dữ liệu được tải (MyTodaySubmissions component) và hiển thị.
2.5. Các điểm tối ưu hóa / Lưu ý đặc biệt cho "AssetEntry"
•	Lazy Loading và Suspense: Component MyTodaySubmissions được lazy-load và chỉ được render khi người dùng mở phần "Thông báo đã gửi của tôi" để giảm tải khởi tạo trang.
•	Cache hiệu quả: MyTodaySubmissions sử dụng fetchWithCache với key cache phụ thuộc vào username và ngày để đảm bảo dữ liệu mới nhất mà vẫn giảm số lần gọi API. cacheManager.delete() sau mỗi lần submit để buộc refresh.
•	Xóa VisibleLazy: Đã gỡ bỏ VisibleLazy khỏi MyTodaySubmissions vì nó đã nằm trong một khung dropdown, việc tải theo yêu cầu người dùng mở ra đã đủ tối ưu.
•	useEffect cho alerts: Tự động tắt alerts thành công sau 4 giây để cải thiện UX.
•	useEffect để cuộn: Cuộn đến phần hướng dẫn trên mobile khi tải trang.
•	Phát sự kiện asset-entry:ready: Báo cho Layout biết AssetEntry đã sẵn sàng để kích hoạt NotificationProvider.
________________________________________
Tuyệt vời! Dưới đây là tài liệu chi tiết về chức năng, logic, luồng thực hiện, thiết kế form, các nút và schema database của các trang "DailyReport" và "BorrowReport". Tài liệu này được biên soạn để AI có thể hiểu rõ và tái tạo chính xác các trang trên một cách tối ưu cho hệ thống frontend React + Vite + TypeScript chạy trên Vercel và backend Supabase.
________________________________________
1. Trang "DailyReport" (Danh sách TS cần lấy)
1.1. Tổng quan trang "DailyReport"
Trang "DailyReport" cung cấp cái nhìn tổng hợp về các giao dịch tài sản đã được thông báo, tập trung vào những tài sản cần được lấy trong ngày hoặc các khoảng thời gian cụ thể. Trang này hỗ trợ người dùng theo dõi, quản lý và thực hiện các tác vụ cần thiết với tài sản.
•	Mục đích: Hiển thị, tổng hợp, và quản lý các giao dịch tài sản cần được lấy theo ngày.
•	Đối tượng sử dụng: Chủ yếu là nhân viên phòng NQ (currentUser.department === 'NQ'), và các nhân viên khác có thể xem báo cáo của riêng họ hoặc báo cáo chung tùy theo vai trò. Admin có toàn quyền chỉnh sửa/xóa.
•	Các tính năng cốt lõi:
•	Hiển thị danh sách giao dịch tài sản theo nhiều bộ lọc thời gian (Sáng, Chiều, Hôm nay, Ngày kế tiếp, Tùy chỉnh).
•	Tự động gom nhóm các mã tài sản theo Phòng và Năm để dễ theo dõi.
•	Hỗ trợ ghi chú đã duyệt cho phòng NQ.
•	Cho phép đánh dấu tài sản "Đã lấy" (chỉ NQ).
•	Chức năng chỉnh sửa và xóa (mềm) giao dịch (tuân thủ giới hạn thời gian và quyền).
•	Tự động làm mới dữ liệu (có thể bật/tắt).
•	Xuất báo cáo dưới dạng PDF.
•	Hiển thị danh sách các giao dịch đã xóa mềm (chỉ admin có thể thao tác).
1.2. Thiết kế Database (Entities) cho "DailyReport"
Trang "DailyReport" tương tác với các entity sau:
1.2.1. AssetTransaction (Giao dịch Tài sản)
Entity cốt lõi, chứa các giao dịch được gửi từ trang AssetEntry.
•	Schema:
•	id: string (UUID, khóa chính)
•	created_date: string (ISO datetime string, tự động tạo)
•	updated_date: string (ISO datetime string, tự động cập nhật)
•	created_by: string (email người tạo)
•	transaction_date: string (định dạng yyyy-MM-dd, Ngày thực hiện giao dịch)
•	parts_day: string (enum: "Sáng", "Chiều", Buổi trong ngày)
•	room: string (enum: "QLN", "CMT8", "NS", "ĐS", "LĐH", "DVKH", Phòng ban)
•	transaction_type: string (enum: "Xuất kho", "Mượn TS", "Thay bìa", Loại hình giao dịch)
•	asset_year: integer (Năm của tài sản, từ 20-99)
•	asset_code: integer (Mã số của tài sản)
•	staff_code: string (Mã nhân viên thực hiện giao dịch)
•	note: string (Ghi chú)
•	notified_at: string (ISO datetime string, thời gian người dùng nhấn nút gửi, dùng cho "Time nhắn")
•	is_deleted: boolean (default: false, đánh dấu xóa mềm)
•	deleted_at: string (ISO datetime string, thời điểm xóa mềm)
•	deleted_by: string (username người xóa)
•	change_logs: array (Lưu trữ lịch sử thay đổi của giao dịch, mỗi phần tử là một object có: time (ISO datetime), field (tên trường thay đổi hoặc 'delete'), old_value, new_value, edited_by (username))
1.2.2. ProcessedNote (Ghi chú đã xử lý)
Entity để phòng NQ ghi lại các ghi chú đã duyệt, hiển thị cùng với các tài sản gom nhóm.
•	Schema:
•	id: string (UUID, khóa chính)
•	created_date: string (ISO datetime string)
•	updated_date: string (ISO datetime string)
•	created_by: string (email người tạo)
•	room: string (enum: "QLN", "CMT8", "NS", "ĐS", "LĐH", "NQ", Phòng ban liên quan đến ghi chú)
•	operation_type: string (enum: "Hoàn trả", "Xuất kho", "Nhập kho", "Xuất mượn", "Thiếu CT", "Khác", Loại tác nghiệp của ghi chú)
•	content: string (Nội dung ghi chú)
•	staff_code: string (Mã nhân viên tạo ghi chú)
•	is_done: boolean (default: false, đánh dấu đã xử lý xong)
•	done_at: string (ISO datetime string, thời gian đánh dấu hoàn thành)
•	mail_to_nv: string (Tên nhân viên nhận email, dùng để gợi ý và gửi mail)
1.2.3. TakenAssetStatus (Trạng thái TS đã lấy)
Entity để phòng NQ đánh dấu các tài sản đã được lấy, nhằm tránh trùng lặp hoặc nhầm lẫn.
•	Schema:
•	id: string (UUID, khóa chính)
•	created_date: string (ISO datetime string)
•	updated_date: string (ISO datetime string)
•	created_by: string (email người tạo)
•	transaction_id: string (ID của AssetTransaction được đánh dấu)
•	user_username: string (Username của người đã đánh dấu)
•	week_year: string (Tuần và năm theo format YYYY-WW, ví dụ: 2024-52)
•	marked_at: string (ISO datetime string, thời gian đánh dấu)
1.2.4. Các Entity Staff liên quan (CBQLN, CBKH, LDPCRC, CBCRC, QUYCRC)
Dùng để tải danh sách gợi ý cho tính năng "Mail đến NV" trong ghi chú.
•	Schema (chung, ví dụ CBQLN):
•	id: string
•	ten_nv: string (Tên nhân viên)
•	email: string (Email nhân viên, không bao gồm domain, ví dụ: abc.hvu)
1.3. Thiết kế UI/Components và Logic cho "DailyReport"
•	Layout: Cấu trúc 2 cột trên desktop (bộ lọc bên trái, báo cáo bên phải) và dạng mobile-first với bộ lọc ẩn trong sheet.
•	Header:
•	Tiêu đề: "Danh sách TS cần lấy" (h1)
•	Thông tin: "Tuần [số tuần] - [năm] ([ngày bắt đầu] - [ngày kết thúc])", và thời gian cập nhật gần nhất.
•	Nút điều khiển:
•	"Bộ lọc" (Filter icon): Chỉ hiển thị trên mobile, mở MobileFilterSheet.
•	Switch "Auto refresh": Bật/tắt tự động làm mới dữ liệu sau mỗi 60s.
•	"Làm mới" (RefreshCw icon): Lấy dữ liệu mới nhất ngay lập tức (bỏ qua cache).
•	"Xuất PDF" (Download icon): Xuất toàn bộ báo cáo hiển thị ra PDF (dùng window.print()).
•	"Hiện DS" / "Ẩn DS" (ListTree icon): Hiển thị/ẩn bảng gom nhóm.
•	Bộ lọc (Desktop):
•	Card chứa RadioGroup với các tùy chọn: "Sáng", "QLN Sáng & PGD trong ngày", "Chiều", "Trong ngày hôm nay", "Trong ngày kế tiếp", "Tùy chọn khoảng thời gian".
•	"Tùy chọn khoảng thời gian": Mở rộng thêm 3 Select (Buổi), Popover Calendar (Từ ngày, Đến ngày).
•	Bảng Gom nhóm (Conditional Card):
•	Chỉ hiển thị khi showGrouped là true.
•	Tiêu đề: "[Ngày/Khoảng thời gian đã chọn]"
•	Nút "Thêm ghi chú" (Plus icon): Chỉ hiển thị cho NQ, mở Dialog "Thêm ghi chú đã duyệt".
•	Bảng Table:
•	Cột: Phòng, Năm, Danh sách Mã TS, Thao tác.
•	Dữ liệu: Các dòng gom nhóm (ví dụ: QLN - 24 - 123, 456, 789*). Dấu * cho biết TS đã được nhắn hơn một lần trong tuần.
•	Ghi chú: Các ghi chú từ ProcessedNote sẽ hiển thị là một dòng "full width", có các nút "Đánh dấu đã xử lý", "Chỉnh sửa", "Xóa".
•	Bảng Chi tiết Giao dịch (Card):
•	Tiêu đề: "Danh sách tài sản cần lấy ([số bản ghi])" + "[Ngày/Khoảng thời gian đã chọn]".
•	Sử dụng ReportTable (desktop) và TransactionCardList (mobile).
•	Cột (ReportTable): STT, Phòng, Năm TS, Mã TS, Loại, Ngày, Buổi, Ghi chú, CB, Time nhắn, Đã lấy, Thao tác.
•	Cột "Đã lấy" (Checkbox): Chỉ hiển thị cho NQ. Cho phép đánh dấu một giao dịch đã được xử lý.
•	Cột "Thao tác": Chỉnh sửa (Edit icon), Xóa (Trash2 icon).
•	Các thao tác này bị giới hạn bởi rowActionGuard.
•	Bảng Giao dịch đã xóa (Chỉ Admin):
•	Hiển thị danh sách các giao dịch is_deleted: true theo cùng bộ lọc.
•	Các thao tác "Chỉnh sửa", "Xóa" chỉ Admin mới thực hiện được.
•	Dialog "Thêm/Chỉnh sửa ghi chú" (Chỉ NQ):
•	Form gồm: Phòng (Select), Loại tác nghiệp (Select), Nội dung (Textarea), Mail đến NV (AutoCompleteInput).
•	Nút "Gửi".
•	Dialog "Chỉnh sửa giao dịch" (Admin hoặc User đủ quyền):
•	Form gồm: Ngày giao dịch (Input type="date"), Buổi (Select), Phòng (Select), Loại tác nghiệp (Select), Năm TS (Input type="number"), Mã TS (Input type="number"), Ghi chú (Textarea).
•	Nút "Cập nhật".
•	Phân trang (Pagination): Hiển thị nếu số lượng giao dịch vượt quá ITEMS_PER_PAGE.
1.4. Logic chi tiết / Luồng thực hiện cho "DailyReport"
•	Tải dữ liệu khởi tạo (useEffect):
•	Khi component mount, tải currentUser từ localStorage.
•	Gọi loadAllTransactions() để tải các giao dịch chính.
•	Nếu canManageDailyReport (NQ), tải loadProcessedNotes().
•	Nếu canSeeTakenColumn (NQ), tải loadTakenStatus().
•	Khởi tạo bộ lọc filterType (Sáng/Chiều/Ngày kế tiếp) dựa trên thời gian hiện tại (GMT+7).
•	Tải AssetTransaction (loadAllTransactions):
•	Sử dụng fetchWithCache với key cache dựa trên start và end của getScopedDateRange().
•	Giới hạn limit trong AssetTransaction.filter() là 2000 để đảm bảo không tải quá nhiều data.
•	Tải ProcessedNote (loadProcessedNotes):
•	Sử dụng fetchWithCache để tải các ghi chú is_done: false.
•	Tải TakenAssetStatus (loadTakenStatus):
•	Sử dụng fetchWithCache với key cache dựa trên currentUser.username và getCurrentWeekYear().
•	Lưu các transaction_id vào một Set để kiểm tra nhanh.
•	Bộ lọc và Gom nhóm (useMemo groupedRows, filteredTransactions, filteredDeletedTransactions):
•	Dữ liệu allTransactions được lọc dựa trên filterType và customFilters.
•	groupedRows:
•	Lọc các giao dịch !is_deleted và !takenTransactionIds.has(t.id).
•	Gom nhóm theo room, sau đó asset_year.
•	Tạo chuỗi codes (ví dụ: 123, 456, 789*). Dấu * được thêm nếu tài sản đó có tần suất xuất hiện >1 trong tuần hiện tại (assetFrequencyThisWeek).
•	Các ProcessedNote is_done: false cũng được thêm vào groupedRows như một dòng riêng.
•	filteredTransactions: Danh sách giao dịch chi tiết sau khi lọc và loại trừ các giao dịch đã xóa mềm.
•	filteredDeletedTransactions: Danh sách giao dịch chi tiết sau khi lọc và chỉ bao gồm các giao dịch đã xóa mềm.
•	Thao tác ghi chú (Chỉ NQ):
•	Thêm: handleNoteSubmit tạo ProcessedNote mới. Có thể gửi email thông báo qua SendEmail nếu mail_to_nv được chọn.
•	Chỉnh sửa: handleEditNote và handleUpdateNote.
•	Xóa: handleDeleteNote xóa ProcessedNote.
•	Đánh dấu đã xong: handleNoteDone cập nhật is_done=true, done_at.
•	Tất cả các thao tác đều xóa cache liên quan và tải lại dữ liệu.
•	Thao tác giao dịch:
•	handleToggleTakenStatus (Chỉ NQ): Cập nhật TakenAssetStatus trong database khi checkbox "Đã lấy" được tick/bỏ tick. Thêm/xóa transaction_id khỏi takenTransactionIds Set.
•	Chỉnh sửa (handleEditTransaction): Admin hoặc user đủ quyền (dựa vào canActOnTransaction) có thể mở Dialog để chỉnh sửa các trường của AssetTransaction. Lịch sử thay đổi được ghi vào change_logs.
•	Xóa (handleDeleteTransaction):
•	Admin có thể xóa vĩnh viễn các giao dịch đã bị xóa mềm (is_deleted=true).
•	Admin hoặc user đủ quyền có thể xóa mềm (is_deleted=true) các giao dịch chưa bị xóa.
•	Lịch sử thay đổi (change_logs) được ghi lại cho cả xóa mềm.
•	Tất cả các thao tác đều xóa cache và tải lại dữ liệu.
•	Giới hạn thời gian:
•	Các khung giờ 7:45-8:05 và 12:45-13:05 (GMT+7) là giờ giới hạn (isRestrictedNow()).
•	Người dùng thường không được thực hiện các thao tác chỉnh sửa/xóa trong khung giờ này. Admin được miễn trừ.
•	Xuất PDF (exportToPDF): Kích hoạt window.print() và ẩn các thành phần UI không cần thiết khi in.
•	Phân trang (Pagination): Chia nhỏ filteredTransactions nếu số lượng lớn hơn ITEMS_PER_PAGE.
1.5. Các điểm tối ưu hóa / Lưu ý đặc biệt cho "DailyReport"
•	Caching (fetchWithCache từ @/components/utils/cache):
•	Được sử dụng cho tất cả các cuộc gọi API để giảm tải backend và tăng tốc độ tải dữ liệu.
•	cacheManager.delete() được gọi một cách chiến lược sau mỗi thao tác Tạo, Cập nhật, Xóa để đảm bảo dữ liệu mới nhất.
•	Key cache động dựa trên username, ID, khoảng thời gian.
•	Background Refresh (Throttled & Visibility-aware):
•	backgroundRefresh chạy định kỳ mỗi 60 giây (có thể bật/tắt) để giữ dữ liệu luôn mới.
•	Chỉ refresh khi tab đang hiển thị (document.hidden).
•	Sử dụng _.isEqual để chỉ cập nhật state nếu dữ liệu thực sự thay đổi, tránh re-render không cần thiết.
•	Initial Load Optimization:
•	loadAllTransactions được gọi bên trong requestIdleCallback (hoặc setTimeout) để trì hoãn việc tải dữ liệu nặng, giúp trang hiển thị UI nhanh hơn.
•	loadProcessedNotes và loadTakenStatus chỉ được gọi khi user có quyền và các phần UI liên quan hiển thị.
•	Time Utilities (@/components/utils/time):
•	Đảm bảo định dạng và tính toán thời gian (đặc biệt là GMT+7) chính xác và nhất quán trên mọi trình duyệt, bao gồm các phiên bản Safari trên iOS.
•	Phân quyền chi tiết: Các hành động được bảo vệ chặt chẽ bằng các hàm kiểm tra quyền (canManageDailyReport, canSeeTakenColumn, canActOnTransaction, isAdmin) để đảm bảo bảo mật và tính toàn vẹn dữ liệu.
•	Scroll to Main Content (Mobile): Tự động cuộn đến phần chính của báo cáo trên di động.
________________________________________
2. Trang "BorrowReport" (Báo cáo tài sản đã mượn)
2.1. Tổng quan trang "BorrowReport"
Trang "BorrowReport" cung cấp báo cáo và phân tích các giao dịch "Mượn TS" chưa được "Xuất kho" trong một khoảng thời gian nhất định. Mục tiêu là giúp người dùng dễ dàng kiểm tra, quản lý các tài sản đang được mượn và cần cắt bìa kiểm tra hàng quý.
•	Mục đích: Hiển thị danh sách các tài sản đã mượn và chưa được xuất kho, cùng với tổng quan thống kê và biểu đồ.
•	Đối tượng sử dụng: Nhân viên quản lý kho, admin.
•	Các tính năng cốt lõi:
•	Lọc dữ liệu theo khoảng ngày tùy chỉnh, phòng, năm TS, mã TS, mã NV, và tìm kiếm tổng hợp.
•	Cung cấp các bộ lọc khoảng ngày nhanh (7 ngày qua, 30 ngày qua, Tháng này, Năm nay).
•	Gom nhóm các giao dịch mượn thành các tài sản duy nhất (Phòng-Năm-Mã TS).
•	Tổng hợp thống kê số lượng tài sản mượn và giao dịch.
•	Biểu đồ cột thể hiện số lượng tài sản mượn theo Phòng.
•	Chức năng xuất báo cáo ra file Excel (CSV) và PDF.
•	Lưu trạng thái bộ lọc vào localStorage để duy trì qua các lần truy cập.
2.2. Thiết kế Database (Entities) cho "BorrowReport"
Trang "BorrowReport" tương tác chủ yếu với entity AssetTransaction.
AssetTransaction (Giao dịch Tài sản)
•	Schema: (Giống như mô tả trong DailyReport)
•	id: string
•	transaction_date: string
•	parts_day: string
•	room: string
•	transaction_type: string (enum: "Xuất kho", "Mượn TS", "Thay bìa")
•	asset_year: integer
•	asset_code: integer
•	staff_code: string
•	note: string
•	notified_at: string
•	is_deleted: boolean
•	deleted_at: string
•	deleted_by: string
•	change_logs: array
•	Liên quan đến trang này:
•	Truy vấn tất cả các giao dịch AssetTransaction trong một khoảng thời gian mở rộng để xác định các tài sản đã được "Xuất kho".
•	Lọc ra các giao dịch có transaction_type === 'Mượn TS'.
2.3. Thiết kế UI/Components và Logic cho "BorrowReport"
•	Layout: Cấu trúc responsive với các Card chứa bộ lọc, tóm tắt, biểu đồ và bảng báo cáo.
•	Header:
•	Tiêu đề: "Báo cáo tài sản đã mượn" (h1)
•	Mô tả: "TS cần cắt bìa kiểm tra hàng quý"
•	Nút điều khiển:
•	"Xuất Excel" (FileUp icon): Xuất dữ liệu đã lọc ra file CSV.
•	"Xuất PDF" (Download icon): Xuất báo cáo hiển thị ra PDF.
•	Bộ lọc thời gian (Card):
•	Tiêu đề: "Bộ lọc thời gian"
•	Input (Popover Calendar): "Từ ngày", "Đến ngày". Cho phép chọn khoảng ngày bất kỳ.
•	Bộ lọc phòng (Card):
•	Tiêu đề: "Hiển thị danh sách theo từng phòng"
•	Select (Select): "Chọn phòng..." (Tất cả, QLN, CMT8, NS, ĐS, LĐH, DVKH).
•	Khoảng thời gian nhanh (Card):
•	Tiêu đề: "Khoảng thời gian nhanh"
•	Nút: "7 ngày qua", "30 ngày qua", "Tháng này", "Năm nay".
•	Nút: "Xóa bộ lọc" để reset tất cả bộ lọc về trạng thái mặc định.
•	Bộ lọc nâng cao & Tìm kiếm (Card):
•	Tiêu đề: "Bộ lọc nâng cao & Tìm kiếm"
•	Input (Input):
•	"Năm TS (vd: 24)"
•	"Mã TS (vd: 259)"
•	"Mã NV (CB)"
•	"Tìm kiếm tổng hợp..." (Tìm kiếm trên tất cả các trường hiển thị)
•	Tóm tắt & Biểu đồ (Card):
•	Card "Tóm tắt": Hiển thị "TS đã mượn (độc nhất)" và "Tổng số giao dịch mượn".
•	Card "TS đã mượn theo Phòng": Biểu đồ cột (BarChart từ Recharts) thể hiện số lượng tài sản mượn theo từng phòng.
•	Bảng Báo cáo (Card):
•	Tiêu đề: "Danh sách tài sản đã mượn ([số bản ghi])"
•	Sử dụng ReportTable.
•	Cột: STT, Phòng, Năm TS, Mã TS, Loại (Mượn TS), Ngày (ngày giao dịch gần nhất), Buổi (buổi giao dịch gần nhất), Ghi chú (ghi chú của giao dịch gần nhất), Số lần (số lần tài sản đó được mượn trong khoảng ngày đã lọc), CB (mã nhân viên).
•	Sorting: Cho phép sắp xếp các cột.
•	Phân trang (Pagination): Hiển thị nếu số lượng giao dịch vượt quá ITEMS_PER_PAGE.
2.4. Logic chi tiết / Luồng thực hiện cho "BorrowReport"
•	Tải dữ liệu khởi tạo (useEffect):
•	Tải currentUser từ localStorage.
•	Tải các bộ lọc đã lưu từ localStorage (nếu có) để khôi phục trạng thái.
•	Gọi loadTransactions() sau một khoảng trễ nhỏ (hoặc khi trình duyệt rảnh) để tối ưu tải ban đầu.
•	Tải AssetTransaction (loadTransactions):
•	Sử dụng getExtendedRange() để mở rộng khoảng ngày truy vấn database (ví dụ: +60 ngày trước và sau khoảng lọc chính). Điều này đảm bảo chúng ta có đủ dữ liệu để kiểm tra xem một tài sản đã mượn có bị "Xuất kho" trong khoảng thời gian rộng hơn khoảng ngày báo cáo chính hay không.
•	Sử dụng fetchWithCache với key cache bao gồm khoảng ngày mở rộng và selectedRoom.
•	Truy vấn AssetTransaction.filter() với khoảng ngày mở rộng và selectedRoom.
•	Xử lý dữ liệu (useMemo filteredTransactions): Đây là phần logic phức tạp nhất.
•	1. Xác định tài sản đã "Xuất kho":
•	Tạo một Set (exportedAssetKeys) chứa các key duy nhất (${room}-${asset_year}-${asset_code}) của tất cả các giao dịch có transaction_type === 'Xuất kho' trong allTransactions (dữ liệu đã tải từ getExtendedRange).
•	2. Lọc các giao dịch "Mượn TS" chưa "Xuất kho":
•	Lọc allTransactions để chỉ lấy các giao dịch có transaction_type === 'Mượn TS'.
•	Tiếp tục lọc để loại bỏ những giao dịch mà assetKey của chúng nằm trong exportedAssetKeys đã tạo ở bước 1.
•	3. Áp dụng bộ lọc chính xác:
•	Các bộ lọc dateRange.start và dateRange.end (khoảng ngày báo cáo chính), selectedRoom được áp dụng cho danh sách các giao dịch "Mượn TS" chưa "Xuất kho".
•	4. Áp dụng bộ lọc nâng cao và tìm kiếm:
•	Các bộ lọc assetYearFilter, assetCodeFilter, staffCodeFilter và debouncedSearch được áp dụng.
•	5. Gom nhóm và tổng hợp:
•	Sử dụng Map (groupedMap) để gom nhóm các giao dịch đã lọc theo key duy nhất (${room}-${asset_year}-${asset_code}).
•	Với mỗi tài sản gom nhóm, lưu trữ: AssetTransaction gần nhất (để lấy ngày, buổi, ghi chú), transaction_count (số lần mượn trong khoảng), và staff_codes (danh sách các CB đã mượn).
•	6. Sắp xếp: Áp dụng sortKey và sortDirection vào finalFiltered.
•	Tổng hợp thống kê (useMemo totalUniqueAssets, totalBorrowTx, chartData):
•	totalUniqueAssets: filteredTransactions.length.
•	totalBorrowTx: Tổng transaction_count của filteredTransactions.
•	chartData: Gom nhóm filteredTransactions theo room và đếm số lượng để tạo dữ liệu cho biểu đồ.
•	Phân trang (useMemo paginatedTransactions): Chia nhỏ filteredTransactions theo ITEMS_PER_PAGE.
•	Xuất Excel (exportToExcel): Tạo file CSV từ filteredTransactions (đã gom nhóm và lọc).
•	Xuất PDF (exportToPDF): Kích hoạt window.print() và ẩn các thành phần UI không cần thiết khi in.
2.5. Các điểm tối ưu hóa / Lưu ý đặc biệt cho "BorrowReport"
•	Caching (fetchWithCache): Sử dụng để tải AssetTransaction để giảm tải database và tăng tốc.
•	useMemo và useCallback: Được sử dụng rộng rãi để memoize kết quả của các phép tính tốn kém (lọc, gom nhóm, sắp xếp) và các hàm, giúp tránh re-render không cần thiết và cải thiện hiệu suất.
•	Debounce Search: useDebounce được dùng cho searchTerm để tránh gọi lại filteredTransactions quá thường xuyên khi người dùng đang gõ.
•	Extended Range Fetching: Khi tải AssetTransaction từ database, khoảng ngày được mở rộng (ví dụ: dateRange +/- 60 ngày) để đảm bảo có đủ dữ liệu để xác định chính xác tài sản nào đã được "Xuất kho" (và do đó không còn là "mượn"). Dữ liệu này sau đó được lọc lại theo khoảng ngày chính xác trên client.
•	Client-side Filtering & Grouping: Thay vì gọi API liên tục cho mỗi thay đổi bộ lọc, một lượng lớn dữ liệu (allTransactions) được tải một lần (với cache), sau đó tất cả các bộ lọc, gom nhóm và sắp xếp được thực hiện trên client để có trải nghiệm người dùng mượt mà hơn.
•	Lưu trữ bộ lọc (localStorage): Trạng thái của tất cả các bộ lọc (dateRange, selectedRoom, assetYearFilter, v.v.) được lưu vào localStorage và khôi phục khi người dùng quay lại trang, cải thiện trải nghiệm.
•	Reset Pagination: currentPage được reset về 1 mỗi khi các bộ lọc, tìm kiếm hoặc sắp xếp thay đổi để đảm bảo người dùng thấy dữ liệu liên quan đến bộ lọc mới.
Tuyệt vời! Dưới đây là tài liệu chi tiết về chức năng, logic, luồng thực hiện, thiết kế form, các nút và schema database của trang "Management" (Quản lý dữ liệu). Tài liệu này được biên soạn để AI có thể hiểu rõ và tái tạo chính xác trang này một cách tối ưu cho hệ thống frontend React + Vite + TypeScript chạy trên Vercel và backend Supabase.
________________________________________
1. Trang "Management" (Quản lý dữ liệu)
1.1. Tổng quan trang "Management"
Trang "Management" là một giao diện quản trị mạnh mẽ, cung cấp cho quản trị viên (Admin) khả năng tương tác trực tiếp với dữ liệu trong hệ thống. Trang này bao gồm các chức năng xem, tạo, sửa, xóa, import/export dữ liệu cho mọi entity, quản lý tài khoản Staff, theo dõi thống kê hệ thống, và cấu hình các tác vụ tự động hóa (ví dụ: xóa dữ liệu cũ).
•	Mục đích: Cung cấp công cụ quản trị dữ liệu toàn diện cho Admin.
•	Đối tượng sử dụng: Chỉ Admin (currentUser.role === 'admin').
•	Các tính năng cốt lõi:
•	Quản lý dữ liệu (Data tab):
•	Chọn bất kỳ entity nào để xem/sửa/xóa/tạo bản ghi.
•	Phân trang, tìm kiếm tổng hợp, lọc và sắp xếp theo cột.
•	Thêm/Sửa bản ghi thông qua Dialog form.
•	Xóa bản ghi đơn lẻ.
•	Xóa hàng loạt giao dịch theo khoảng ngày (chỉ cho AssetTransaction).
•	Import/Export dữ liệu dưới dạng CSV.
•	Tùy chỉnh các cột hiển thị trong bảng.
•	Quản lý trạng thái tài khoản Staff (khóa/mở khóa).
•	Thống kê (Stats tab):
•	Các tác vụ nhanh: Xóa log cũ tự động, Backup toàn bộ dữ liệu, Xóa & Backup toàn bộ.
•	Hiển thị trạng thái tiến trình cho các tác vụ lâu.
•	Tích hợp AdvancedStats để theo dõi hiệu suất hệ thống, hoạt động người dùng và sự kiện bảo mật.
•	Tổng quan & Cài đặt (Overview & Settings tab):
•	Hiển thị thống kê số lượng bản ghi của mọi entity.
•	Cấu hình cài đặt tự động xóa dữ liệu cũ cho từng entity.
•	Chức năng Backup/Restore toàn bộ database.
1.2. Thiết kế Database (Entities) cho "Management"
Trang "Management" tương tác với tất cả các entity hiện có trong hệ thống. Ngoài ra, nó quản lý một entity đặc biệt để lưu trữ các cài đặt hệ thống.
1.2.1. Tất cả các Entity trong hệ thống
Trang này có khả năng đọc, tạo, cập nhật, xóa bản ghi cho mọi entity. Dưới đây là ví dụ một số entity chính (schema đầy đủ được giữ ở các file entity riêng biệt):
•	AssetTransaction: Quản lý các giao dịch tài sản.
•	Staff: Quản lý tài khoản nhân viên (username, password, role, department, trạng thái tài khoản).
•	Contract: Quản lý hợp đồng.
•	SecurityEvent: Quản lý các sự kiện bảo mật.
•	UserActivityLog: Quản lý nhật ký hoạt động người dùng.
•	SystemLog: Quản lý nhật ký hệ thống.
•	Notification: Quản lý thông báo trong ứng dụng.
•	... (và tất cả các entity khác như CBQLN, CBKH, ProcessedNote, v.v.)
1.2.2. SystemSettings (Cài đặt Hệ thống)
Entity dùng để lưu trữ các cài đặt cấu hình của ứng dụng, bao gồm cài đặt tự động xóa dữ liệu cũ và ngưỡng giám sát hệ thống.
•	Schema:
•	id: string (UUID, khóa chính)
•	created_date: string (ISO datetime string)
•	updated_date: string (ISO datetime string)
•	created_by: string (email của người tạo record)
•	setting_key: string (Khóa định danh cài đặt, ví dụ: "auto_delete_settings_v3", "monitoring_thresholds_v1", DUY NHẤT, BẮT BUỘC)
•	setting_value: string (Giá trị cài đặt dưới dạng JSON string, BẮT BUỘC)
•	setting_type: string (enum: "auto_delete", "monitoring", "system", Phân loại cài đặt)
•	updated_by: string (Username của người cập nhật cài đặt cuối cùng)
•	description: string (Mô tả về cài đặt này)
•	Liên quan đến trang này:
•	Đọc và lưu cài đặt tự động xóa dữ liệu cũ (setting_key: "auto_delete_settings_v3").
•	Đọc và lưu ngưỡng giám sát hệ thống (setting_key: "monitoring_thresholds_v1", được dùng trong AdvancedStats).
1.3. Thiết kế UI/Components và Logic cho "Management"
Trang Management sử dụng React, Shadcn/ui, Tailwind CSS và nhiều component phụ trợ để tổ chức giao diện phức tạp.
1.3.1. Header chính
•	Tiêu đề: "Quản lý dữ liệu" (h1).
•	Mô tả: "Hệ thống quản lý và backup dữ liệu toàn diện với các tính năng tự động hóa hiện đại".
•	Icon: Settings (Lucide React).
•	Thông báo (Alert): Hiển thị các thông báo thành công/thất bại sau các thao tác (tạo, sửa, xóa, import, export, backup, restore, v.v.).
1.3.2. Tabs điều hướng chính (Tabs)
Chia trang thành 3 phần chính: "Thống kê", "Quản lý dữ liệu", "Tổng quan & Cài đặt".
Tab 1: "Thống kê" (value="stats")
•	Tác vụ nhanh (Card):
•	Tiêu đề: "Tác vụ nhanh".
•	Nút "Xóa log cũ" (Trash icon, variant="destructive"):
•	Chức năng: Kích hoạt quá trình tự động xóa dữ liệu cũ dựa trên cài đặt trong tab "Tổng quan & Cài đặt".
•	Disabled khi các tác vụ khác (backup, restore) đang chạy.
•	Nút "Backup toàn bộ" (Archive icon):
•	Chức năng: Tạo một file ZIP chứa dữ liệu của tất cả các entity dưới dạng JSON và CSV, cộng với một file all_entities.json tổng hợp.
•	Disabled khi các tác vụ khác đang chạy.
•	Nút "Xóa & Backup toàn bộ" (Archive icon):
•	Chức năng: Thực hiện tuần tự các bước "Xóa log cũ" và sau đó "Backup toàn bộ".
•	Disabled khi các tác vụ khác đang chạy.
•	Hiển thị tiến trình: Thanh tiến trình (với Loader2 icon và animate-spin) và văn bản mô tả trạng thái (deleteStatusText, restoreProgress).
•	Hệ thống thống kê và phân tích (AdvancedStats component):
•	Một component riêng biệt (AdvancedStats.jsx) được tích hợp vào đây. Component này cung cấp các biểu đồ, số liệu về hiệu suất hệ thống, hoạt động người dùng và sự kiện bảo mật.
Tab 2: "Quản lý dữ liệu" (value="data")
•	Chọn bảng dữ liệu (Card):
•	Tiêu đề: "Chọn bảng dữ liệu".
•	Select (Select): Cho phép chọn một trong các entity đã được định cấu hình (entityConfig).
•	Chức năng: Khi chọn, tải dữ liệu tương ứng vào bảng bên dưới. Reset tìm kiếm, phân trang.
•	Nút "Tạo mới" (Plus icon):
•	Chức năng: Mở Dialog form để tạo bản ghi mới cho entity đang chọn.
•	Disabled nếu chưa chọn entity nào.
•	Nút "Backup All Data" / "Khôi phục từ Backup":
•	Chỉ hiển thị khi chưa có entity nào được chọn trong Select.
•	"Backup All Data": Chức năng tương tự như nút "Backup toàn bộ" trong tab "Thống kê".
•	"Khôi phục từ Backup": Cho phép người dùng tải lên một file JSON để khôi phục dữ liệu. (Chi tiết logic trong handleRestoreBackup).
•	Nút "Xuất CSV" (Download icon):
•	Chức năng: Xuất dữ liệu đã lọc và sắp xếp của entity hiện tại ra file CSV.
•	Disabled nếu không có dữ liệu để xuất.
•	Nút "Nhập CSV" (Upload icon):
•	Chức năng: Cho phép người dùng tải lên một file CSV để bulkCreate bản ghi mới cho entity hiện tại.
•	Dropdown "Chọn cột" (DropdownMenuCheckboxItem):
•	Chức năng: Cho phép người dùng chọn các cột muốn hiển thị trong bảng.
•	Lưu lựa chọn vào localStorage cho mỗi entity.
•	Tìm kiếm & Lọc tổng hợp (Input):
•	Input "Tìm kiếm trong bảng dữ liệu" để lọc dữ liệu hiển thị trong bảng theo tất cả các cột.
•	Bộ lọc này được áp dụng cho data trước khi phân trang và sắp xếp.
•	Xóa hàng loạt giao dịch (Card - chỉ cho AssetTransaction và Admin):
•	Tiêu đề: "Xóa hàng loạt (Admin)".
•	Input (type="date"): "Ngày bắt đầu", "Ngày kết thúc".
•	Nút "Xóa theo ngày" (Trash icon, variant="destructive"): Xóa tất cả các AssetTransaction trong khoảng ngày đã chọn.
•	Bảng hiển thị dữ liệu (Card):
•	Tiêu đề: "Tên Entity ([số bản ghi])". Cập nhật với kết quả lọc/tổng số.
•	Hiển thị thông báo "Đang tải..." hoặc "Chưa có dữ liệu" nếu thích hợp.
•	Bảng Table (Shadcn/ui):
•	Header: Dynamic, dựa trên fields của entityConfig[selectedEntity].
•	Mỗi TableHead có thể click để sắp xếp (toggle asc/desc).
•	Input/Select Filters: Dưới mỗi TableHead, có một Input hoặc Select để lọc dữ liệu theo từng cột.
•	Body: Hiển thị dữ liệu đã lọc, sắp xếp và phân trang.
•	Cột "Thao tác":
•	Nút "Chỉnh sửa" (Edit icon): Mở Dialog form để chỉnh sửa bản ghi.
•	Nút "Khóa/Mở khóa tài khoản" (Lock/AlertCircle icon - chỉ cho Staff): Thay đổi account_status của Staff.
•	Nút "Xóa" (Trash2 icon, variant="destructive"): Xóa bản ghi (gọi entity.delete(id)).
•	Phân trang (Pagination component): Dưới bảng.
•	Dialog "Thêm mới/Chỉnh sửa" bản ghi:
•	Title: "Thêm mới/Chỉnh sửa [Tên Entity]".
•	Form: Dynamic, render các Input, Select, Textarea dựa trên fields và type của entityConfig[selectedEntity].
•	Nút "Hủy": Đóng dialog.
•	Nút "Cập nhật" / "Thêm mới": Gọi entity.update() hoặc entity.create().
Tab 3: "Tổng quan & Cài đặt" (value="overview")
•	Thống kê Entity (EntityStatsTable component):
•	Một component riêng biệt (EntityStatsTable.jsx) được tích hợp vào đây.
•	Hiển thị danh sách tất cả các entity.
•	Đối với mỗi entity: tên, độ ưu tiên, số bản ghi (tải khi cần hoặc khi refresh tất cả), thời gian cập nhật cuối.
•	Cột "Tự động xóa" (Switch): Bật/tắt tính năng tự động xóa dữ liệu cũ cho entity này.
•	Cột "Khoảng thời gian (ngày)" (Select): Chọn số ngày (7, 15, 30, 60, 90, 180, 365) mà sau đó dữ liệu sẽ được coi là cũ và có thể bị xóa.
•	Cột "Thao tác": Nút "Tải số liệu", "Xuất CSV" (cho entity đó), "Xóa dữ liệu cũ" (cho entity đó).
•	Nút "Tải dữ liệu tất cả": Tải số liệu bản ghi cho mọi entity.
•	Nút "Lưu cài đặt": Lưu cấu hình tự động xóa vào SystemSettings.
1.4. Logic chi tiết / Luồng thực hiện cho "Management"
•	Kiểm tra quyền Admin (useEffect loadCurrentStaff):
•	Khi component mount, kiểm tra currentUser.role. Nếu không phải Admin, chuyển hướng về /AssetEntry.
•	Quản lý entityConfig: Một object entityConfig được định nghĩa sẵn, ánh xạ key (tên entity) tới object chứa entity (instance của Entity SDK), name (tên hiển thị), và fields (mảng các object { key, label, type, options } mô tả schema của entity, dùng để render bảng và form).
•	Tải dữ liệu bảng (loadData):
•	Dựa trên selectedEntity, gọi selectedEntity.entity.list() để tải dữ liệu.
•	Sử dụng fetchWithCache với cacheKey riêng cho từng entity.
•	Mặc định sắp xếp theo -created_date hoặc trường ngày phù hợp khác (-transaction_date, -deposit_date, v.v.).
•	Tìm kiếm, Lọc, Sắp xếp, Phân trang (useMemo):
•	filteredData: Lọc dữ liệu data theo searchTerm (tìm kiếm toàn cục) và columnFilters (lọc theo từng cột).
•	sortedFilteredData: Sắp xếp filteredData theo sortKey và sortDirection. Xử lý các kiểu dữ liệu number, date, string riêng biệt.
•	currentTableData: Lấy slice của sortedFilteredData cho trang hiện tại.
•	Thêm/Sửa bản ghi (handleAdd, handleEdit, handleSave):
•	handleAdd: Reset formData, đặt editingItem=null.
•	handleEdit: Load dữ liệu của item vào formData, đặt editingItem=item.
•	handleSave:
•	Xử lý các giá trị boolean từ Select ("true"/"false") thành true/false.
•	Xử lý giá trị rỗng của các trường date/datetime-local thành null.
•	Nếu editingItem tồn tại, gọi entity.update(). Ngược lại, gọi entity.create().
•	Xóa cache của entity liên quan và gọi loadData() để refresh bảng.
•	Xóa bản ghi (handleDelete):
•	Hiển thị confirm() trước khi xóa.
•	Gọi entity.delete(id).
•	Xóa cache và gọi loadData().
•	Xóa hàng loạt giao dịch (handleBulkDelete - chỉ AssetTransaction):
•	Lọc các AssetTransaction trong khoảng ngày đã chọn.
•	Thực hiện AssetTransaction.delete() cho từng giao dịch.
•	Xóa cache và gọi loadData().
•	Quản lý trạng thái tài khoản Staff (handleToggleAccountStatus):
•	Chuyển đổi account_status giữa 'active' và 'locked'. Reset failed_login_attempts.
•	Cập nhật locked_at nếu tài khoản bị khóa.
•	Import CSV (handleImportCSV):
•	Đọc file CSV, phân tích thành các dòng và giá trị.
•	Đối sánh header CSV với field.label trong entityConfig.
•	Chuyển đổi kiểu dữ liệu (number, boolean, date) và bulkCreate các bản ghi.
•	Export CSV (exportToCSV):
•	Sử dụng buildEntityCSV để tạo chuỗi CSV từ dữ liệu đã lọc (filteredData).
•	Xử lý escape ký tự đặc biệt trong CSV.
•	Tạo Blob và trigger tải file.
•	Backup toàn bộ (backupAllData):
•	Lặp qua tất cả các entity trong entityConfig.
•	Đối với mỗi entity: tải tất cả bản ghi, lấy schema, tạo JSON và CSV cho entity đó.
•	Gom tất cả vào một file all_entities.json.
•	Sử dụng buildZip (một hàm utility tùy chỉnh để tạo file ZIP phía client) để đóng gói tất cả các file JSON/CSV vào một file .zip và tải xuống.
•	Restore từ Backup (handleRestoreBackup):
•	Đọc file JSON (có thể là all_entities.json hoặc JSON của một entity đơn lẻ).
•	Nếu là all_entities.json, lặp qua từng entity, lấy records và bulkCreate theo lô (chunks) để tránh quá tải. Hiển thị tiến trình khôi phục.
•	Nếu là JSON của một entity, bulkCreate cho entity đang chọn.
•	Các tác vụ tự động (trong tab Stats và Overview):
•	deleteAllLogsCore: Thực hiện xóa các bản ghi cũ theo cấu hình trong SystemSettings (key auto_delete_settings_v3).
•	Lặp qua các entity được cấu hình tự động xóa, tính toán cutoff date, tìm các bản ghi cũ hơn cutoff date.
•	Xóa từng bản ghi theo lô và cập nhật tiến trình.
•	handleDeleteAllLog: Gọi deleteAllLogsCore khi nhấn nút "Xóa log cũ".
•	handleDeleteAndBackupAll: Gọi tuần tự deleteAllLogsCore rồi backupAllData.
•	EntityStatsTable (component riêng):
•	Hiển thị danh sách tất cả entity với số lượng bản ghi (tải khi click hoặc refresh).
•	Cho phép bật/tắt tự động xóa và chọn intervalDays.
•	Lưu các cài đặt này vào SystemSettings (key auto_delete_settings_v3).
•	Nút "Làm mới", "Lưu cài đặt", "Xuất CSV" (từng entity), "Xóa dữ liệu cũ" (từng entity).
•	AdvancedStats (component riêng):
•	Hiển thị các biểu đồ, số liệu về hiệu suất hệ thống, hoạt động người dùng, sự kiện bảo mật. Có bộ lọc thời gian riêng và khả năng cấu hình ngưỡng cảnh báo lưu vào SystemSettings (key monitoring_thresholds_v1).
1.5. Các điểm tối ưu hóa / Lưu ý đặc biệt cho "Management"
•	Phân quyền chặt chẽ: Toàn bộ trang và các chức năng quan trọng (xóa, tạo, sửa, import/export, backup/restore) chỉ có thể truy cập bởi người dùng có role: 'admin'. Nếu không phải Admin, sẽ tự động chuyển hướng về /AssetEntry.
•	Xử lý bản ghi theo lô (bulkCreate, chunkArray): Khi Import hoặc Restore, dữ liệu được xử lý theo từng lô nhỏ (ví dụ: 200 bản ghi mỗi lần) để tránh quá tải hệ thống và lỗi timeout, đặc biệt là với các tập dữ liệu lớn.
•	Xóa cache chiến lược (cacheManager.delete): Sau mỗi thao tác CUD (Create, Update, Delete) hoặc Backup/Restore, cache liên quan đến entity đó hoặc toàn bộ cache sẽ bị xóa để đảm bảo dữ liệu mới nhất được tải lại.
•	Tiến trình hiển thị: Các tác vụ dài như Backup, Restore, Delete logs đều có thanh tiến trình và thông báo trạng thái để người dùng biết quá trình đang diễn ra.
•	CSV Utility (buildEntityCSV): Hàm này được thiết kế để tạo CSV chính xác, xử lý escape ký tự (dấu phẩy, dấu nháy kép) và định dạng các kiểu dữ liệu (date, datetime-local, boolean).
•	ZIP Utility (buildZip): Một hàm tùy chỉnh được viết để tạo file ZIP ngay trên client-side, đóng gói nhiều file JSON/CSV vào một file nén mà không cần thư viện lớn.
•	Dynamic UI: Giao diện form và bảng được xây dựng động dựa trên entityConfig, giúp dễ dàng mở rộng khi có entity mới mà không cần sửa đổi nhiều code UI.
•	UX cho lọc và sắp xếp:
•	Tìm kiếm tổng hợp (searchTerm) và lọc theo cột (columnFilters) hoạt động đồng thời.
•	sortKey và sortDirection được lưu để duy trì trạng thái sắp xếp.
•	Phân trang tự động reset về trang 1 khi bộ lọc/tìm kiếm thay đổi.

